// /app/api/cohost/send/route.ts
// Send approved message to PMS and save training data

import { NextRequest, NextResponse } from 'next/server'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'
import { sendMessageViaPms } from '@/lib/connectors'
import { PmsType } from '@/lib/connectors/types'
import * as hostaway from '@/lib/connectors/hostaway'
import * as guesty from '@/lib/connectors/guesty'

export async function POST(request: NextRequest) {
  try {
    const { messageId, draftId, finalText } = await request.json()

    if (!messageId || !finalText) {
      return NextResponse.json(
        { error: 'Message ID and final text are required' },
        { status: 400 }
      )
    }

    const supabase = createCohostServiceClient()

    // 1. Get message with conversation and draft
    const { data: message, error: msgError } = await supabase
      .from('cohost_messages')
      .select(`
        id,
        body,
        workspace_id,
        conversation_id,
        category,
        cohost_conversations (
          id,
          external_conversation_id,
          pms_type,
          property_id,
          guest_name
        )
      `)
      .eq('id', messageId)
      .single()

    if (msgError || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    const conversation = message.cohost_conversations as any
    const workspaceId = message.workspace_id
    const pmsType = conversation.pms_type as PmsType

    // 2. Get PMS credentials
    const { data: pmsAccount, error: pmsError } = await supabase
      .from('cohost_pms_accounts')
      .select('credentials_json')
      .eq('workspace_id', workspaceId)
      .eq('pms_type', pmsType)
      .single()

    if (pmsError || !pmsAccount) {
      return NextResponse.json(
        { error: `${pmsType} is not configured` },
        { status: 400 }
      )
    }

    // 3. Get access token based on PMS type
    let accessToken: string
    const creds = pmsAccount.credentials_json as Record<string, string>

    if (pmsType === 'hostaway') {
      const authResult = await hostaway.getAccessToken(creds.account_id, creds.api_key)
      if (!authResult.ok || !authResult.accessToken) {
        return NextResponse.json(
          { error: `Hostaway auth failed: ${authResult.error}` },
          { status: 401 }
        )
      }
      accessToken = authResult.accessToken
    } else if (pmsType === 'guesty') {
      const authResult = await guesty.getAccessToken(creds.client_id, creds.client_secret)
      if (!authResult.ok || !authResult.accessToken) {
        return NextResponse.json(
          { error: `Guesty auth failed: ${authResult.error}` },
          { status: 401 }
        )
      }
      accessToken = authResult.accessToken
    } else if (pmsType === 'hospitable') {
      // Hospitable uses PAT directly
      accessToken = creds.api_token
      if (!accessToken) {
        return NextResponse.json(
          { error: 'Hospitable API token not configured' },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json(
        { error: `Unsupported PMS type: ${pmsType}` },
        { status: 400 }
      )
    }

    // 4. Send message via PMS
    const sendResult = await sendMessageViaPms(pmsType, {
      accessToken,
      conversationId: conversation.external_conversation_id,
      message: finalText,
    })

    if (!sendResult.ok) {
      console.error('Failed to send message:', sendResult.error)
      return NextResponse.json(
        { error: sendResult.error || 'Failed to send message' },
        { status: 500 }
      )
    }

    // 5. Update message status
    await supabase
      .from('cohost_messages')
      .update({ status: 'sent' })
      .eq('id', messageId)

    // 6. Insert outbound message record
    const { data: outboundMsg } = await supabase
      .from('cohost_messages')
      .insert({
        workspace_id: workspaceId,
        conversation_id: conversation.id,
        direction: 'outbound',
        body: finalText,
        external_message_id: sendResult.externalMessageId,
        status: 'sent',
      })
      .select('id')
      .single()

    // 7. Get the original AI draft to compare
    let aiDraftText = ''
    let wasEdited = false
    
    if (draftId) {
      const { data: draft } = await supabase
        .from('cohost_drafts')
        .select('draft_text')
        .eq('id', draftId)
        .single()
      
      if (draft) {
        aiDraftText = draft.draft_text
        wasEdited = aiDraftText.trim() !== finalText.trim()
      }
    }

    // 8. Save training data for AI learning
    if (aiDraftText) {
      const similarityScore = calculateSimilarity(aiDraftText, finalText)
      
      await supabase.from('cohost_training_data').insert({
        workspace_id: workspaceId,
        property_id: conversation.property_id,
        message_id: messageId,
        guest_message: message.body,
        ai_draft: aiDraftText,
        final_response: finalText,
        was_edited: wasEdited,
        similarity_score: similarityScore,
        category: message.category,
      })
    }

    // 9. Log audit action
    await supabase.from('cohost_actions_audit').insert({
      workspace_id: workspaceId,
      message_id: messageId,
      action_type: 'sent',
      meta: {
        pms_type: pmsType,
        external_message_id: sendResult.externalMessageId,
        was_edited: wasEdited,
      },
    })

    return NextResponse.json({
      success: true,
      external_message_id: sendResult.externalMessageId,
      was_edited: wasEdited,
    })
  } catch (error) {
    console.error('Send message error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    )
  }
}

// Calculate similarity between AI draft and final response (0-100)
function calculateSimilarity(text1: string, text2: string): number {
  const s1 = text1.toLowerCase().trim()
  const s2 = text2.toLowerCase().trim()
  
  if (s1 === s2) return 100
  if (!s1 || !s2) return 0
  
  // Simple word overlap similarity
  const words1 = new Set(s1.split(/\s+/))
  const words2 = new Set(s2.split(/\s+/))
  
  let overlap = 0
  words1.forEach(word => {
    if (words2.has(word)) overlap++
  })
  
  const totalUnique = new Set([...words1, ...words2]).size
  return Math.round((overlap / totalUnique) * 100)
}