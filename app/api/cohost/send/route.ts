// /app/api/cohost/send/route.ts
// Send approved message through PMS connector

import { NextRequest, NextResponse } from 'next/server'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'
import { sendMessageViaPms } from '@/lib/connectors'

export async function POST(request: NextRequest) {
  try {
    const { messageId, replyText } = await request.json()
    
    if (!messageId) {
      return NextResponse.json(
        { error: 'Missing messageId' },
        { status: 400 }
      )
    }
    
    if (!replyText) {
      return NextResponse.json(
        { error: 'Missing replyText' },
        { status: 400 }
      )
    }
    
    const supabase = createCohostServiceClient()
    
    // 1. Fetch message with conversation and workspace info
    const { data: message, error: msgError } = await supabase
      .from('cohost_messages')
      .select(`
        id,
        workspace_id,
        conversation_id,
        status,
        cohost_conversations (
          id,
          pms_type,
          external_conversation_id
        )
      `)
      .eq('id', messageId)
      .single()
    
    if (msgError || !message) {
      console.error('Message not found:', msgError)
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }
    
    const conversation = message.cohost_conversations as any
    const workspaceId = message.workspace_id
    const pmsType = conversation?.pms_type
    const reservationId = conversation?.external_conversation_id
    
    if (!pmsType || !reservationId) {
      return NextResponse.json(
        { error: 'Missing PMS type or reservation ID' },
        { status: 400 }
      )
    }
    
    // 2. Fetch PMS account credentials
    const { data: pmsAccount, error: pmsError } = await supabase
      .from('cohost_pms_accounts')
      .select('credentials_json')
      .eq('workspace_id', workspaceId)
      .eq('pms_type', pmsType)
      .single()
    
    if (pmsError || !pmsAccount) {
      console.error('PMS account not found:', pmsError)
      return NextResponse.json(
        { error: `No ${pmsType} account configured for this workspace` },
        { status: 404 }
      )
    }
    
    const credentials = pmsAccount.credentials_json as Record<string, string>
    const apiKey = credentials?.api_key
    
    if (!apiKey) {
      return NextResponse.json(
        { error: `${pmsType} API key not configured` },
        { status: 400 }
      )
    }
    
    // 3. Send message via PMS connector
    const sendResult = await sendMessageViaPms(pmsType, {
      apiKey,
      reservationId,
      message: replyText
    })
    
    if (!sendResult.ok) {
      // Log the failed attempt
      await supabase
        .from('cohost_actions_audit')
        .insert({
          workspace_id: workspaceId,
          message_id: messageId,
          action_type: 'sent',
          meta: { 
            success: false, 
            error: sendResult.error,
            pms_type: pmsType
          }
        })
      
      return NextResponse.json(
        { error: sendResult.error || 'Failed to send message' },
        { status: 500 }
      )
    }
    
    // 4. Success: Update message status and create outbound message record
    await supabase
      .from('cohost_messages')
      .update({ status: 'sent' })
      .eq('id', messageId)
    
    // 5. Create outbound message record
    await supabase
      .from('cohost_messages')
      .insert({
        workspace_id: workspaceId,
        conversation_id: message.conversation_id,
        direction: 'outbound',
        body: replyText,
        external_message_id: sendResult.externalMessageId || null,
        raw_payload: { sent_via: pmsType },
        status: 'sent'
      })
    
    // 6. Log successful send
    await supabase
      .from('cohost_actions_audit')
      .insert({
        workspace_id: workspaceId,
        message_id: messageId,
        action_type: 'sent',
        meta: { 
          success: true, 
          pms_type: pmsType,
          external_message_id: sendResult.externalMessageId
        }
      })
    
    return NextResponse.json({ 
      success: true,
      externalMessageId: sendResult.externalMessageId
    })
    
  } catch (error) {
    console.error('Send error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}