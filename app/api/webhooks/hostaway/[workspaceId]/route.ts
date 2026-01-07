// /app/api/webhooks/hostaway/[workspaceId]/route.ts
// Webhook endpoint for Hostaway to send guest messages

import { NextRequest, NextResponse } from 'next/server'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  
  try {
    const payload = await request.json()
    
    // Validate webhook secret
    const secretFromHeader = request.headers.get('x-webhook-secret')
    const secretFromQuery = request.nextUrl.searchParams.get('secret')
    const providedSecret = secretFromHeader || secretFromQuery
    
    if (!providedSecret) {
      return NextResponse.json({ error: 'Missing webhook secret' }, { status: 401 })
    }
    
    const supabase = createCohostServiceClient()
    
    // Verify workspace + secret
    const { data: pmsAccount, error: pmsError } = await supabase
      .from('cohost_pms_accounts')
      .select('id, webhook_secret')
      .eq('workspace_id', workspaceId)
      .eq('pms_type', 'hostaway')
      .single()
    
    if (pmsError || !pmsAccount) {
      return NextResponse.json({ error: 'Workspace not found or Hostaway not configured' }, { status: 404 })
    }
    
    if (pmsAccount.webhook_secret !== providedSecret) {
      return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 })
    }
    
    // Extract message data from Hostaway payload (best-effort)
    const externalConversationId = 
      payload.conversationId ||
      payload.conversation_id ||
      payload.reservationId ||
      payload.reservation_id ||
      payload.id ||
      `hostaway-${Date.now()}`
    
    const messageBody = 
      payload.message ||
      payload.body ||
      payload.text ||
      payload.content ||
      JSON.stringify(payload)
    
    const externalMessageId = payload.messageId || payload.message_id || payload.id || null
    
    const guestName = 
      payload.guestName ||
      payload.guest_name ||
      payload.guest?.name ||
      null
    
    // Upsert conversation
    const { data: conversation, error: convError } = await supabase
      .from('cohost_conversations')
      .upsert(
        {
          workspace_id: workspaceId,
          pms_type: 'hostaway',
          external_conversation_id: String(externalConversationId),
          guest_name: guestName
        },
        { onConflict: 'workspace_id,pms_type,external_conversation_id' }
      )
      .select('id')
      .single()
    
    if (convError || !conversation) {
      console.error('Failed to upsert conversation:', convError)
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
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
        status: 'new'
      })
      .select('id')
      .single()
    
    if (msgError || !message) {
      console.error('Failed to insert message:', msgError)
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }
    
    // Log audit action
    await supabase
      .from('cohost_actions_audit')
      .insert({
        workspace_id: workspaceId,
        message_id: message.id,
        action_type: 'webhook_ingested',
        meta: { pms_type: 'hostaway', external_message_id: externalMessageId }
      })
    
    return NextResponse.json({ success: true, message_id: message.id, conversation_id: conversation.id })
    
  } catch (error) {
    console.error('Hostaway webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}