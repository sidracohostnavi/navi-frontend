// /app/api/webhooks/lodgify/[workspaceId]/route.ts
// Webhook endpoint for Lodgify to send guest messages

import { NextRequest, NextResponse } from 'next/server'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  
  try {
    // 1. Get the raw payload
    const payload = await request.json()
    
    // 2. Validate webhook secret
    const secretFromHeader = request.headers.get('x-webhook-secret')
    const secretFromQuery = request.nextUrl.searchParams.get('secret')
    const providedSecret = secretFromHeader || secretFromQuery
    
    if (!providedSecret) {
      return NextResponse.json(
        { error: 'Missing webhook secret' },
        { status: 401 }
      )
    }
    
    // 3. Connect to Supabase and verify workspace + secret
    const supabase = createCohostServiceClient()
    
    const { data: pmsAccount, error: pmsError } = await supabase
      .from('cohost_pms_accounts')
      .select('id, webhook_secret')
      .eq('workspace_id', workspaceId)
      .eq('pms_type', 'lodgify')
      .single()
    
    if (pmsError || !pmsAccount) {
      console.error('PMS account not found:', pmsError)
      return NextResponse.json(
        { error: 'Workspace not found or Lodgify not configured' },
        { status: 404 }
      )
    }
    
    if (pmsAccount.webhook_secret !== providedSecret) {
      return NextResponse.json(
        { error: 'Invalid webhook secret' },
        { status: 401 }
      )
    }
    
    // 4. Extract message data from Lodgify payload
    // Lodgify webhook fields vary - we do best-effort extraction
    const externalConversationId = 
      payload.conversation_id || 
      payload.thread_id || 
      payload.booking_id ||
      payload.id ||
      `lodgify-${Date.now()}`
    
    const messageBody = 
      payload.message || 
      payload.body || 
      payload.text || 
      payload.content ||
      JSON.stringify(payload)
    
    const externalMessageId = 
      payload.message_id || 
      payload.id ||
      null
    
    const guestName = 
      payload.guest_name ||
      payload.guest?.name ||
      payload.sender_name ||
      payload.from ||
      null
    
    // 5. Upsert conversation
    const { data: conversation, error: convError } = await supabase
      .from('cohost_conversations')
      .upsert(
        {
          workspace_id: workspaceId,
          pms_type: 'lodgify',
          external_conversation_id: String(externalConversationId),
          guest_name: guestName
        },
        {
          onConflict: 'workspace_id,pms_type,external_conversation_id'
        }
      )
      .select('id')
      .single()
    
    if (convError || !conversation) {
      console.error('Failed to upsert conversation:', convError)
      return NextResponse.json(
        { error: 'Failed to create conversation' },
        { status: 500 }
      )
    }
    
    // 6. Insert the inbound message
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
      return NextResponse.json(
        { error: 'Failed to save message' },
        { status: 500 }
      )
    }
    
    // 7. Log the audit action
    await supabase
      .from('cohost_actions_audit')
      .insert({
        workspace_id: workspaceId,
        message_id: message.id,
        action_type: 'webhook_ingested',
        meta: { pms_type: 'lodgify', external_message_id: externalMessageId }
      })
    
    // 8. Respond quickly with 200
    return NextResponse.json({ 
      success: true, 
      message_id: message.id,
      conversation_id: conversation.id
    })
    
  } catch (error) {
    console.error('Lodgify webhook error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}