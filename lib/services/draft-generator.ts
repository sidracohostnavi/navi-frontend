/**
 * DraftGeneratorService
 *
 * Generates AI reply drafts for inbound guest messages using OpenAI.
 * Writes results to cohost_ai_drafts with status='pending'.
 *
 * Called from:
 *  - MessageProcessor (automatically after every new inbound message)
 *  - /api/cohost/messaging/generate-draft (on-demand from the thread UI)
 */

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

export type DraftGeneratorResult =
  | { success: true; draft: { id: string; draft_body: string } }
  | { success: false; error: string }

const MODEL = 'gpt-4o-mini'

export class DraftGeneratorService {
  /**
   * Generate a reply draft for a given inbound message.
   *
   * @param conversationId  The cohost_conversations.id
   * @param messageId       The cohost_messages.id of the inbound message to reply to
   * @param supabaseClient  Optional pre-created client (pass from cron context)
   */
  static async generateForMessage(
    conversationId: string,
    messageId: string,
    supabaseClient?: any
  ): Promise<DraftGeneratorResult> {
    const supabase = supabaseClient || (await createClient())

    // ── 1. Check for existing pending draft (idempotency) ──────────────────
    const { data: existing } = await supabase
      .from('cohost_ai_drafts')
      .select('id, draft_body')
      .eq('conversation_id', conversationId)
      .eq('triggered_by_message_id', messageId)
      .eq('status', 'pending')
      .maybeSingle()

    if (existing) {
      console.log(`[DraftGenerator] Draft already exists for message ${messageId}`)
      return { success: true, draft: existing }
    }

    // ── 2. Load conversation + booking + property ──────────────────────────
    const { data: conv, error: convErr } = await supabase
      .from('cohost_conversations')
      .select(`
        id, channel, workspace_id,
        bookings (
          id, guest_name, enriched_guest_name, check_in, check_out, source
        ),
        cohost_properties (
          id, name, description, headline,
          your_property, guest_access, interaction_with_guests,
          other_details, rental_agreement_text
        )
      `)
      .eq('id', conversationId)
      .single()

    if (convErr || !conv) {
      return { success: false, error: 'Conversation not found' }
    }

    const booking = conv.bookings as any
    const property = conv.cohost_properties as any

    // ── 3. Load message history (last 12 for context, then the target msg) ─
    const { data: allMessages } = await supabase
      .from('cohost_messages')
      .select('id, direction, body, sent_at')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true })
      .limit(30)

    const messages = allMessages || []

    // Find the specific inbound message we're replying to
    const targetMessage = messages.find((m: any) => m.id === messageId)
    if (!targetMessage) {
      return { success: false, error: 'Target message not found in conversation' }
    }

    // Build conversation history (everything before the target message)
    const historyMessages = messages.filter(
      (m: any) => new Date(m.sent_at) < new Date(targetMessage.sent_at)
    )

    // ── 4. Load host profile for sign-off name ─────────────────────────────
    const { data: hostProfile } = await supabase
      .from('host_profiles')
      .select('first_name, last_name, business_name')
      .eq('workspace_id', conv.workspace_id)
      .maybeSingle()

    const hostName =
      hostProfile?.first_name
        ? `${hostProfile.first_name}${hostProfile.last_name ? ' ' + hostProfile.last_name : ''}`
        : hostProfile?.business_name || null

    // ── 5. Build system prompt ─────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt({ property, booking, hostName })

    // ── 6. Build message array for chat completion ─────────────────────────
    const chatMessages: OpenAI.ChatCompletionMessageParam[] = []

    // Conversation history as alternating turns
    for (const msg of historyMessages.slice(-10)) {
      chatMessages.push({
        role: msg.direction === 'inbound' ? 'user' : 'assistant',
        content: msg.body,
      })
    }

    // The guest message we're replying to
    chatMessages.push({
      role: 'user',
      content: targetMessage.body,
    })

    // ── 7. Call OpenAI ─────────────────────────────────────────────────────
    let draftBody: string

    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...chatMessages],
        temperature: 0.6,
        max_tokens: 500,
      })

      const text = completion.choices[0]?.message?.content?.trim()
      if (!text) throw new Error('Empty response from OpenAI')
      draftBody = text
    } catch (err: any) {
      console.error('[DraftGenerator] OpenAI error:', err.message)
      return { success: false, error: `AI generation failed: ${err.message}` }
    }

    // ── 8. Save draft ──────────────────────────────────────────────────────
    const { data: draft, error: draftErr } = await supabase
      .from('cohost_ai_drafts')
      .insert({
        conversation_id: conversationId,
        triggered_by_message_id: messageId,
        draft_body: draftBody,
        status: 'pending',
      })
      .select('id, draft_body')
      .single()

    if (draftErr || !draft) {
      console.error('[DraftGenerator] Error saving draft:', draftErr)
      return { success: false, error: 'Failed to save draft' }
    }

    console.log(
      `[DraftGenerator] ✅ Draft created for message ${messageId} in conversation ${conversationId}`
    )
    return { success: true, draft }
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildSystemPrompt({
  property,
  booking,
  hostName,
}: {
  property: any
  booking: any
  hostName: string | null
}): string {
  const parts: string[] = []

  parts.push(
    `You are Navi, an AI assistant helping a short-term rental host respond to guest messages.` +
    ` Write replies in a warm, friendly, and professional tone — like a great host would.` +
    ` Be concise. Don't over-explain. If you don't know something specific, say "I'll check on that for you" rather than guessing.`
  )

  if (hostName) {
    parts.push(`The host's name is ${hostName}. Sign off with their name when appropriate.`)
  }

  // Property context
  const propParts: string[] = []
  if (property?.name) propParts.push(`Property: ${property.name}`)
  if (property?.headline) propParts.push(`Headline: ${property.headline}`)
  if (property?.description) propParts.push(`Description: ${property.description}`)
  if (property?.your_property) propParts.push(`About this property: ${property.your_property}`)
  if (property?.guest_access) propParts.push(`Guest access: ${property.guest_access}`)
  if (property?.interaction_with_guests)
    propParts.push(`Interaction style: ${property.interaction_with_guests}`)
  if (property?.other_details) propParts.push(`Other details: ${property.other_details}`)
  if (property?.rental_agreement_text)
    propParts.push(`House rules / rental agreement:\n${property.rental_agreement_text}`)

  if (propParts.length > 0) {
    parts.push(`\n--- PROPERTY INFORMATION ---\n${propParts.join('\n')}`)
  }

  // Booking context
  if (booking) {
    const guestName = booking.enriched_guest_name || booking.guest_name
    const checkIn = booking.check_in
      ? new Date(booking.check_in).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : null
    const checkOut = booking.check_out
      ? new Date(booking.check_out).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : null

    const bookingParts: string[] = []
    if (guestName) bookingParts.push(`Guest: ${guestName}`)
    if (checkIn) bookingParts.push(`Check-in: ${checkIn}`)
    if (checkOut) bookingParts.push(`Check-out: ${checkOut}`)

    if (bookingParts.length > 0) {
      parts.push(`\n--- BOOKING ---\n${bookingParts.join('\n')}`)
    }
  }

  parts.push(
    `\nWrite only the reply message text — no subject lines, no "Dear...", no metadata.` +
    ` The previous messages in the conversation will be provided as context.`
  )

  return parts.join('\n')
}
