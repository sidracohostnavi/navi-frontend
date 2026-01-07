// /app/api/cohost/escalate/route.ts
// Escalate a message for human review

import { NextRequest, NextResponse } from 'next/server'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'

export async function POST(request: NextRequest) {
  try {
    const { messageId, reason, userId } = await request.json()

    if (!messageId) {
      return NextResponse.json(
        { error: 'Message ID is required' },
        { status: 400 }
      )
    }

    const supabase = createCohostServiceClient()

    // 1. Get the message
    const { data: message, error: msgError } = await supabase
      .from('cohost_messages')
      .select('id, workspace_id, status')
      .eq('id', messageId)
      .single()

    if (msgError || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    // 2. Update message status
    await supabase
      .from('cohost_messages')
      .update({ status: 'escalated' })
      .eq('id', messageId)

    // 3. Create escalation record
    const { data: escalation, error: escError } = await supabase
      .from('cohost_escalations')
      .insert({
        workspace_id: message.workspace_id,
        message_id: messageId,
        escalated_by: userId || null,
        reason: reason || 'Manually escalated',
        status: 'pending',
      })
      .select('id')
      .single()

    if (escError) {
      console.error('Failed to create escalation:', escError)
      return NextResponse.json(
        { error: 'Failed to create escalation' },
        { status: 500 }
      )
    }

    // 4. Log audit action
    await supabase.from('cohost_actions_audit').insert({
      workspace_id: message.workspace_id,
      message_id: messageId,
      action_type: 'escalated',
      actor_user_id: userId || null,
      meta: { reason, escalation_id: escalation.id },
    })

    // 5. TODO: Send notification email/slack if configured

    return NextResponse.json({
      success: true,
      escalation_id: escalation.id,
    })
  } catch (error) {
    console.error('Escalate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to escalate' },
      { status: 500 }
    )
  }
}