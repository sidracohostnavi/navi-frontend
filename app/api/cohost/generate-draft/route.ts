// /app/api/cohost/generate-draft/route.ts
// Generate AI draft reply for a guest message

import { NextRequest, NextResponse } from 'next/server'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'

export async function POST(request: NextRequest) {
  try {
    const { messageId, workspaceId } = await request.json()
    
    if (!messageId || !workspaceId) {
      return NextResponse.json(
        { error: 'Missing messageId or workspaceId' },
        { status: 400 }
      )
    }
    
    const supabase = createCohostServiceClient()
    
    // 1. Fetch the message and conversation
    const { data: message, error: msgError } = await supabase
      .from('cohost_messages')
      .select(`
        id,
        body,
        workspace_id,
        conversation_id,
        cohost_conversations (
          guest_name,
          property_id,
          pms_type
        )
      `)
      .eq('id', messageId)
      .eq('workspace_id', workspaceId)
      .single()
    
    if (msgError || !message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }
    
    const conversation = message.cohost_conversations as any
    
    // 2. Fetch workspace prompt profile
    const { data: promptProfile } = await supabase
      .from('cohost_prompt_profiles')
      .select('system_instructions')
      .eq('workspace_id', workspaceId)
      .single()
    
    // 3. Fetch property-specific override if property exists
    let propertyOverride = null
    if (conversation?.property_id) {
      const { data: override } = await supabase
        .from('cohost_property_prompt_overrides')
        .select('override_instructions')
        .eq('property_id', conversation.property_id)
        .single()
      propertyOverride = override?.override_instructions
    }
    
    // 4. Build the system prompt
    const baseInstructions = promptProfile?.system_instructions || ''
    const systemPrompt = buildSystemPrompt(baseInstructions, propertyOverride)
    
    // 5. Call OpenAI API
    const aiResponse = await callOpenAI(systemPrompt, message.body, conversation?.guest_name)
    
    // 6. Save the draft
    const { data: draft, error: draftError } = await supabase
      .from('cohost_drafts')
      .insert({
        workspace_id: workspaceId,
        message_id: messageId,
        model: 'gpt-4o-mini',
        draft_text: aiResponse.reply,
        risk_level: aiResponse.risk_level,
        recommended_action: aiResponse.recommended_action
      })
      .select('id')
      .single()
    
    if (draftError) {
      console.error('Failed to save draft:', draftError)
      return NextResponse.json(
        { error: 'Failed to save draft' },
        { status: 500 }
      )
    }
    
    // 7. Update message status to 'drafted'
    await supabase
      .from('cohost_messages')
      .update({ status: 'drafted' })
      .eq('id', messageId)
    
    // 8. Log audit action
    await supabase
      .from('cohost_actions_audit')
      .insert({
        workspace_id: workspaceId,
        message_id: messageId,
        action_type: 'draft_generated',
        meta: { draft_id: draft.id, model: 'gpt-4o-mini' }
      })
    
    return NextResponse.json({ 
      success: true, 
      draft_id: draft.id,
      reply: aiResponse.reply,
      risk_level: aiResponse.risk_level
    })
    
  } catch (error) {
    console.error('Generate draft error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function buildSystemPrompt(baseInstructions: string, propertyOverride: string | null): string {
  const defaultInstructions = `You are a helpful, professional short-term rental host assistant. 
Your job is to draft friendly, helpful replies to guest messages.

RULES:
- Be warm, professional, and concise
- Never promise refunds or discounts without explicit approval
- If you're unsure about something, ask clarifying questions
- Keep replies short (2-4 sentences for simple questions)
- For complex issues, acknowledge the concern and offer to help

After drafting your reply, assess the risk level:
- LOW: Routine questions (check-in times, directions, amenities)
- MED: Complaints, special requests, or anything requiring judgment
- HIGH: Refund requests, safety issues, threats, or legal concerns`

  let prompt = defaultInstructions
  
  if (baseInstructions) {
    prompt += `\n\nADDITIONAL HOST INSTRUCTIONS:\n${baseInstructions}`
  }
  
  if (propertyOverride) {
    prompt += `\n\nPROPERTY-SPECIFIC INSTRUCTIONS:\n${propertyOverride}`
  }
  
  return prompt
}

interface AIResponse {
  reply: string
  risk_level: 'low' | 'med' | 'high'
  recommended_action: string
}

async function callOpenAI(systemPrompt: string, guestMessage: string, guestName: string | null): Promise<AIResponse> {
  const apiKey = process.env.OPENAI_API_KEY
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  
  const userPrompt = `Guest${guestName ? ` (${guestName})` : ''} sent this message:

"${guestMessage}"

Please provide:
1. A draft reply to send to the guest
2. Risk level (low, med, or high)
3. Recommended next action

Respond in this exact JSON format:
{
  "reply": "Your draft reply here",
  "risk_level": "low",
  "recommended_action": "Send as-is" 
}`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 500
    })
  })
  
  if (!response.ok) {
    const error = await response.text()
    console.error('OpenAI API error:', error)
    throw new Error('Failed to generate AI response')
  }
  
  const data = await response.json()
  const content = data.choices[0]?.message?.content
  
  if (!content) {
    throw new Error('No response from AI')
  }
  
  // Parse the JSON response
  try {
    // Extract JSON from the response (handles markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }
    
    const parsed = JSON.parse(jsonMatch[0])
    return {
      reply: parsed.reply || 'Unable to generate reply',
      risk_level: ['low', 'med', 'high'].includes(parsed.risk_level) ? parsed.risk_level : 'med',
      recommended_action: parsed.recommended_action || 'Review before sending'
    }
  } catch (parseError) {
    console.error('Failed to parse AI response:', content)
    // Fallback: use the raw content as the reply
    return {
      reply: content,
      risk_level: 'med',
      recommended_action: 'Review carefully - AI response format was unexpected'
    }
  }
}