// /app/api/webhooks/hospitable/route.ts
// Webhook endpoint for Hospitable message events

import { NextRequest, NextResponse } from 'next/server'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()
    
    // Get workspace ID from query param
    const workspaceId = request.nextUrl.searchParams.get('workspace')
    const secret = request.nextUrl.searchParams.get('secret')
    
    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing workspace ID' }, { status: 400 })
    }
    
    const supabase = createCohostServiceClient()
    
    // Verify webhook secret
    const { data: pmsAccount, error: pmsError } = await supabase
      .from('cohost_pms_accounts')
      .select('id, webhook_secret')
      .eq('workspace_id', workspaceId)
      .eq('pms_type', 'hospitable')
      .single()
    
    if (pmsError || !pmsAccount) {
      console.error('PMS account not found:', pmsError)
      return NextResponse.json({ error: 'Workspace not configured' }, { status: 404 })
    }
    
    if (pmsAccount.webhook_secret !== secret) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
    }
    
    // Hospitable webhook payload structure
    // action: 'message.received'
    // data: { id, conversation_id, body, direction, sent_at, ... }
    const action = payload.action
    const data = payload.data || payload
    
    // Only process inbound messages
    if (action && action !== 'message.received') {
      return NextResponse.json({ success: true, skipped: 'not a message event' })
    }
    
    const isInbound = data.direction === 'inbound' || data.is_from_guest === true
    if (!isInbound) {
      return NextResponse.json({ success: true, skipped: 'outbound message' })
    }
    
    const externalConversationId = String(data.conversation_id || data.thread_id)
    const externalMessageId = data.id ? String(data.id) : null
    const messageBody = data.body || data.content || ''
    const guestName = data.guest_name || data.sender_name || null
    
    // Upsert conversation
    const { data: conversation, error: convError } = await supabase
      .from('cohost_conversations')
      .upsert(
        {
          workspace_id: workspaceId,
          pms_type: 'hospitable',
          external_conversation_id: externalConversationId,
          guest_name: guestName,
        },
        { onConflict: 'workspace_id,pms_type,external_conversation_id' }
      )
      .select('id')
      .single()
    
    if (convError || !conversation) {
      console.error('Failed to upsert conversation:', convError)
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
    }
    
    // Check for duplicate message
    if (externalMessageId) {
      const { data: existing } = await supabase
        .from('cohost_messages')
        .select('id')
        .eq('external_message_id', externalMessageId)
        .single()
      
      if (existing) {
        return NextResponse.json({ success: true, skipped: 'duplicate message' })
      }
    }
    
    // Insert the inbound message
    const { data: message, error: msgError } = await supabase
      .from('cohost_messages')
      .insert({
        workspace_id: workspaceId,
        conversation_id: conversation.id,
        direction: 'inbound',
        body: messageBody,
        external_message_id: externalMessageId,
        raw_payload: payload,
        status: 'new',
      })
      .select('id')
      .single()
    
    if (msgError || !message) {
      console.error('Failed to insert message:', msgError)
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }
    
    // Log audit action
    await supabase.from('cohost_actions_audit').insert({
      workspace_id: workspaceId,
      message_id: message.id,
      action_type: 'webhook_ingested',
      meta: { pms_type: 'hospitable', external_message_id: externalMessageId },
    })
    
    return NextResponse.json({
      success: true,
      message_id: message.id,
      conversation_id: conversation.id,
    })
  } catch (error) {
    console.error('Hospitable webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}