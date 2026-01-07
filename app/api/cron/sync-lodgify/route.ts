// /app/api/cron/sync-lodgify/route.ts
// Cron job to sync messages from Lodgify for all workspaces

import { NextRequest, NextResponse } from 'next/server'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'
import { getRecentReservations, getReservationMessages } from '@/lib/connectors/lodgify'

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization')
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createCohostServiceClient()
    
    // 1. Get all workspaces with Lodgify configured
    const { data: pmsAccounts, error: pmsError } = await supabase
      .from('cohost_pms_accounts')
      .select('workspace_id, credentials_json')
      .eq('pms_type', 'lodgify')
    
    if (pmsError) {
      console.error('Failed to fetch PMS accounts:', pmsError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!pmsAccounts || pmsAccounts.length === 0) {
      return NextResponse.json({ message: 'No Lodgify accounts configured', synced: 0 })
    }

    let totalNewMessages = 0
    const results: any[] = []

    // 2. Process each workspace
    for (const account of pmsAccounts) {
      const workspaceId = account.workspace_id
      const apiKey = (account.credentials_json as any)?.api_key

      if (!apiKey) {
        results.push({ workspaceId, error: 'No API key configured' })
        continue
      }

      try {
        // 3. Get recent reservations
        const reservationsResult = await getRecentReservations(apiKey)
        
        if (!reservationsResult.ok || !reservationsResult.reservations) {
          results.push({ workspaceId, error: reservationsResult.error })
          continue
        }

        let workspaceNewMessages = 0

        // 4. For each reservation, fetch messages
        for (const reservation of reservationsResult.reservations) {
          const reservationId = reservation.id.toString()
          
          // Get messages for this reservation
          const messagesResult = await getReservationMessages(apiKey, reservationId)
          
          if (!messagesResult.ok || !messagesResult.messages) {
            continue
          }

          // Filter to only guest messages (inbound)
          const guestMessages = messagesResult.messages.filter(m => m.type === 'guest')

          if (guestMessages.length === 0) {
            continue
          }

          // 5. Upsert conversation
          const { data: conversation, error: convError } = await supabase
            .from('cohost_conversations')
            .upsert(
              {
                workspace_id: workspaceId,
                pms_type: 'lodgify',
                external_conversation_id: reservationId,
                guest_name: reservation.guest?.name || null,
                property_id: null // Could map to cohost_properties if needed
              },
              { onConflict: 'workspace_id,pms_type,external_conversation_id' }
            )
            .select('id')
            .single()

          if (convError || !conversation) {
            console.error('Failed to upsert conversation:', convError)
            continue
          }

          // 6. Check which messages we already have
          const { data: existingMessages } = await supabase
            .from('cohost_messages')
            .select('external_message_id')
            .eq('conversation_id', conversation.id)
          
          const existingIds = new Set(
            existingMessages?.map(m => m.external_message_id) || []
          )

          // 7. Insert new messages
          for (const msg of guestMessages) {
            const externalMessageId = msg.id.toString()
            
            if (existingIds.has(externalMessageId)) {
              continue // Already have this message
            }

            const { error: insertError } = await supabase
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

            if (!insertError) {
              workspaceNewMessages++
              
              // Log audit action
              await supabase
                .from('cohost_actions_audit')
                .insert({
                  workspace_id: workspaceId,
                  message_id: null, // We'd need to get the inserted ID
                  action_type: 'webhook_ingested',
                  meta: { 
                    pms_type: 'lodgify', 
                    external_message_id: externalMessageId,
                    source: 'cron_sync'
                  }
                })
            }
          }
        }

        totalNewMessages += workspaceNewMessages
        results.push({ 
          workspaceId, 
          newMessages: workspaceNewMessages,
          reservationsChecked: reservationsResult.reservations.length
        })

      } catch (err) {
        console.error(`Error syncing workspace ${workspaceId}:`, err)
        results.push({ 
          workspaceId, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        })
      }
    }

    // 8. Update last sync time (optional - could add a table for this)
    console.log(`Lodgify sync complete: ${totalNewMessages} new messages`)

    return NextResponse.json({
      success: true,
      totalNewMessages,
      workspacesProcessed: pmsAccounts.length,
      results
    })

  } catch (error) {
    console.error('Cron sync error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}