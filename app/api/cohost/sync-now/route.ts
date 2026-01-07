// /app/api/cohost/sync-now/route.ts
// Manual sync trigger for a specific workspace

import { NextRequest, NextResponse } from 'next/server'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'
import { getRecentReservations, getReservationMessages } from '@/lib/connectors/lodgify'

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json()

    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    }

    const supabase = createCohostServiceClient()

    // Get Lodgify credentials for this workspace
    const { data: pmsAccount, error: pmsError } = await supabase
      .from('cohost_pms_accounts')
      .select('credentials_json')
      .eq('workspace_id', workspaceId)
      .eq('pms_type', 'lodgify')
      .single()

    if (pmsError || !pmsAccount) {
      return NextResponse.json({ error: 'Lodgify not configured' }, { status: 404 })
    }

    const apiKey = (pmsAccount.credentials_json as any)?.api_key
    if (!apiKey) {
      return NextResponse.json({ error: 'Lodgify API key not set' }, { status: 400 })
    }

    // Fetch reservations
    const reservationsResult = await getRecentReservations(apiKey)
    
    if (!reservationsResult.ok || !reservationsResult.reservations) {
      return NextResponse.json({ 
        error: reservationsResult.error || 'Failed to fetch reservations' 
      }, { status: 500 })
    }

    let newMessages = 0

    // Process each reservation
    for (const reservation of reservationsResult.reservations) {
      const reservationId = reservation.id.toString()

      // Get messages for this reservation
      const messagesResult = await getReservationMessages(apiKey, reservationId)
      
      if (!messagesResult.ok || !messagesResult.messages) {
        continue
      }

      // Filter to only guest messages
      const guestMessages = messagesResult.messages.filter(m => m.type === 'guest')

      if (guestMessages.length === 0) {
        continue
      }

      // Upsert conversation
      const { data: conversation, error: convError } = await supabase
        .from('cohost_conversations')
        .upsert(
          {
            workspace_id: workspaceId,
            pms_type: 'lodgify',
            external_conversation_id: reservationId,
            guest_name: reservation.guest?.name || null
          },
          { onConflict: 'workspace_id,pms_type,external_conversation_id' }
        )
        .select('id')
        .single()

      if (convError || !conversation) {
        continue
      }

      // Get existing message IDs
      const { data: existingMessages } = await supabase
        .from('cohost_messages')
        .select('external_message_id')
        .eq('conversation_id', conversation.id)

      const existingIds = new Set(
        existingMessages?.map(m => m.external_message_id) || []
      )

      // Insert new messages
      for (const msg of guestMessages) {
        const externalMessageId = msg.id.toString()

        if (existingIds.has(externalMessageId)) {
          continue
        }

        const { data: insertedMessage, error: insertError } = await supabase
          .from('cohost_messages')
          .insert({
            workspace_id: workspaceId,
            conversation_id: conversation.id,
            direction: 'inbound',
            body: msg.body || '',
            external_message_id: externalMessageId,
            raw_payload: msg,
            status: 'new',
            received_at: msg.created_at || new Date().toISOString()
          })
          .select('id')
          .single()

        if (!insertError && insertedMessage) {
          newMessages++

          // Log audit action
          await supabase
            .from('cohost_actions_audit')
            .insert({
              workspace_id: workspaceId,
              message_id: insertedMessage.id,
              action_type: 'webhook_ingested',
              meta: {
                pms_type: 'lodgify',
                external_message_id: externalMessageId,
                source: 'manual_sync'
              }
            })
        }
      }
    }

    return NextResponse.json({
      success: true,
      newMessages,
      reservationsChecked: reservationsResult.reservations.length
    })

  } catch (error) {
    console.error('Manual sync error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}