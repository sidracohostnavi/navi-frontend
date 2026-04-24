// /app/api/cohost/messaging/send/route.ts
// Store outbound message and deliver it via the appropriate channel + provider.
//
// For gmail_relay + gmail provider:      GmailService.sendReply()
// For gmail_relay + microsoft provider:  MicrosoftMailService.sendReply()
// For gmail_relay + smtp provider:       SmtpMailService.sendReply()
// For direct_email:                      Resend (sends FROM noreply@cohostnavi.com)
//
// The message row is always written first so it's tracked even if delivery fails.
//
// POST body: { conversation_id, body, draft_id?, edited? }
// Response:  { message, delivered, delivery_error? }

import { NextRequest, NextResponse } from 'next/server'
import { createCohostClient } from '@/lib/supabase/cohostServer'
import { GmailService } from '@/lib/services/gmail-service'
import { MicrosoftMailService } from '@/lib/services/microsoft-mail-service'
import { SmtpMailService } from '@/lib/services/smtp-mail-service'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const { conversation_id, body, draft_id, edited } = await request.json()

    if (!conversation_id || !body?.trim()) {
      return NextResponse.json(
        { error: 'conversation_id and body are required' },
        { status: 400 }
      )
    }

    const supabase = createCohostClient()

    // 1. Load conversation with booking info (for direct_email channel)
    const { data: conv, error: convError } = await supabase
      .from('cohost_conversations')
      .select(`
        id, workspace_id, property_id, channel, gmail_thread_id,
        bookings!inner(guest_name, enriched_guest_name, guest_email)
      `)
      .eq('id', conversation_id)
      .single()

    if (convError || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const now = new Date().toISOString()

    // 2. Insert the outbound message (always, before attempting delivery)
    const { data: message, error: msgError } = await supabase
      .from('cohost_messages')
      .insert({
        conversation_id,
        direction: 'outbound',
        body: body.trim(),
        sent_at: now,
        sent_by_user_id: null,
        is_read: true,
      })
      .select('id, conversation_id, direction, body, sent_at, sent_by_user_id, is_read')
      .single()

    if (msgError || !message) {
      console.error('[messaging/send] Error inserting message:', msgError)
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }

    // 3. Update conversation metadata
    await supabase
      .from('cohost_conversations')
      .update({ last_message_at: now })
      .eq('id', conversation_id)

    // 4. Update AI draft status if one was used
    if (draft_id) {
      const draftUpdate: Record<string, string> = { status: edited ? 'edited' : 'approved' }
      if (edited) draftUpdate.edited_body = body.trim()
      await supabase
        .from('cohost_ai_drafts')
        .update(draftUpdate)
        .eq('id', draft_id)
    }

    // 5. Deliver via the channel + provider
    let delivered = false
    let delivery_error: string | undefined

    if (conv.channel === 'gmail_relay') {
      const result = await deliverGmailRelay(supabase, conv, body.trim())
      delivered = result.delivered
      delivery_error = result.error

      // Back-fill sent message ID onto the outbound row if available
      if (result.sentMessageId) {
        await supabase
          .from('cohost_messages')
          .update({ gmail_message_id: result.sentMessageId })
          .eq('id', message.id)
      }
    } else if (conv.channel === 'direct_email') {
      const result = await deliverDirectEmail(conv, body.trim())
      delivered = result.delivered
      delivery_error = result.error
    }

    if (delivery_error) {
      console.warn(`[messaging/send] Delivery failed for message ${message.id}: ${delivery_error}`)
    }

    return NextResponse.json({ message, delivered, delivery_error })
  } catch (err: any) {
    console.error('[messaging/send] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── gmail_relay delivery ──────────────────────────────────────────────────────

async function deliverGmailRelay(
  supabase: any,
  conv: any,
  body: string
): Promise<{ delivered: boolean; error?: string; sentMessageId?: string }> {
  if (!conv.gmail_thread_id) {
    return { delivered: false, error: 'No Gmail thread ID on this conversation — cannot send reply' }
  }

  // Find the active email connection for this property and its provider
  const connection = await findConnectionForProperty(supabase, conv.property_id)
  if (!connection) {
    return { delivered: false, error: 'No active email connection found for this property' }
  }

  const provider = connection.email_provider || 'gmail'

  if (provider === 'gmail') {
    // Gmail: find last inbound Gmail message ID for In-Reply-To header
    const lastGmailMsgId = await findLastInboundGmailMessageId(
      supabase,
      conv.gmail_thread_id,
      connection.id
    )
    if (!lastGmailMsgId) {
      return { delivered: false, error: 'Could not find original inbound Gmail message to reply to' }
    }
    const result = await GmailService.sendReply(
      connection.id,
      conv.gmail_thread_id,
      lastGmailMsgId,
      body,
      supabase
    )
    return {
      delivered: result.success,
      error: result.error,
      sentMessageId: result.sentGmailMessageId,
    }
  }

  if (provider === 'microsoft') {
    // Microsoft: find the last inbound message's Graph message ID
    const graphMsgId = await findLastInboundGraphMessageId(
      supabase,
      conv.gmail_thread_id, // stored as conversationId in this column for Microsoft threads
      connection.id
    )
    if (!graphMsgId) {
      return { delivered: false, error: 'Could not find original inbound Microsoft message to reply to' }
    }
    const result = await MicrosoftMailService.sendReply(connection.id, graphMsgId, body, supabase)
    return {
      delivered: result.success,
      error: result.error,
      sentMessageId: result.sentMessageId,
    }
  }

  if (provider === 'smtp') {
    // SMTP: we need the relay address (Reply-To of the original inbound email)
    const replyInfo = await findSmtpReplyInfo(supabase, conv.gmail_thread_id, connection.id)
    if (!replyInfo) {
      return { delivered: false, error: 'Could not find relay address for SMTP reply' }
    }
    const result = await SmtpMailService.sendReply(
      connection.id,
      {
        replyToAddress: replyInfo.replyToAddress,
        subject: replyInfo.subject,
        body,
        inReplyToMsgId: replyInfo.internetMessageId,
        references: replyInfo.references,
      },
      supabase
    )
    return { delivered: result.success, error: result.error }
  }

  return { delivered: false, error: `Unknown email_provider: ${provider}` }
}

// ─── direct_email delivery (Resend) ───────────────────────────────────────────

async function deliverDirectEmail(
  conv: any,
  body: string
): Promise<{ delivered: boolean; error?: string }> {
  const booking = Array.isArray(conv.bookings) ? conv.bookings[0] : conv.bookings
  const guestEmail = booking?.guest_email
  const guestName = booking?.enriched_guest_name || booking?.guest_name || 'Guest'

  if (!guestEmail) {
    return { delivered: false, error: 'No guest email on booking — cannot send direct email' }
  }

  const fromAddress = process.env.EMAIL_FROM || 'noreply@cohostnavi.com'

  try {
    await resend.emails.send({
      from: fromAddress,
      to: guestEmail,
      subject: `Message from your host`,
      text: body,
    })
    console.log(`[messaging/send] ✅ Direct email sent to ${guestEmail}`)
    return { delivered: true }
  } catch (err: any) {
    console.error('[messaging/send] Resend error:', err.message)
    return { delivered: false, error: err.message }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ConnectionRow = {
  id: string
  email_provider: string
}

async function findConnectionForProperty(
  supabase: any,
  propertyId: string
): Promise<ConnectionRow | null> {
  // Try Gmail first
  const { data: gmailConn } = await supabase
    .from('connection_properties')
    .select('connections!inner(id, email_provider, gmail_status, archived_at)')
    .eq('property_id', propertyId)
    .is('connections.archived_at', null)
    .eq('connections.gmail_status', 'connected')
    .limit(1)
    .maybeSingle()

  if (gmailConn?.connections) {
    return { id: gmailConn.connections.id, email_provider: 'gmail' }
  }

  // Try Microsoft
  const { data: msConn } = await supabase
    .from('connection_properties')
    .select('connections!inner(id, email_provider, microsoft_status, archived_at)')
    .eq('property_id', propertyId)
    .is('connections.archived_at', null)
    .eq('connections.microsoft_status', 'connected')
    .limit(1)
    .maybeSingle()

  if (msConn?.connections) {
    return { id: msConn.connections.id, email_provider: 'microsoft' }
  }

  // Try SMTP
  const { data: smtpConn } = await supabase
    .from('connection_properties')
    .select('connections!inner(id, email_provider, smtp_status, archived_at)')
    .eq('property_id', propertyId)
    .is('connections.archived_at', null)
    .eq('connections.smtp_status', 'connected')
    .limit(1)
    .maybeSingle()

  if (smtpConn?.connections) {
    return { id: smtpConn.connections.id, email_provider: 'smtp' }
  }

  return null
}

async function findLastInboundGmailMessageId(
  supabase: any,
  threadId: string,
  connectionId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('gmail_messages')
    .select('gmail_message_id')
    .eq('thread_id', threadId)
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.gmail_message_id ?? null
}

async function findLastInboundGraphMessageId(
  supabase: any,
  conversationId: string,
  connectionId: string
): Promise<string | null> {
  // For Microsoft threads, conversationId is stored in the thread_id column.
  // The Graph message ID is stored in gmail_message_id (it's the provider's native msg ID).
  const { data } = await supabase
    .from('gmail_messages')
    .select('gmail_message_id, raw_metadata')
    .eq('thread_id', conversationId)
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Prefer the graph_message_id stored in raw_metadata; fall back to gmail_message_id
  return data?.raw_metadata?._microsoft?.graph_message_id ?? data?.gmail_message_id ?? null
}

async function findSmtpReplyInfo(
  supabase: any,
  threadId: string,
  connectionId: string
): Promise<{
  replyToAddress: string
  subject: string
  internetMessageId?: string
  references?: string
} | null> {
  const { data } = await supabase
    .from('gmail_messages')
    .select('subject, raw_metadata')
    .eq('thread_id', threadId)
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  // For SMTP connections ingest, the relay/reply-to address and message headers
  // would be stored in raw_metadata._smtp or raw_metadata._microsoft by the respective ingestor.
  // Fall back to extracting from the original_msg headers.
  const meta = data.raw_metadata
  const headers: { name: string; value: string }[] = meta?.original_msg?.headers || []
  const h = (name: string) => headers.find((x: any) => x.name?.toLowerCase() === name)?.value || ''

  const replyToAddress = h('reply-to') || h('from')
  if (!replyToAddress) return null

  return {
    replyToAddress,
    subject: data.subject || '',
    internetMessageId: h('message-id') || undefined,
    references: h('references') || undefined,
  }
}
