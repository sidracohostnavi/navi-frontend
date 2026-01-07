// /app/api/cohost/escalate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'

export async function POST(request: NextRequest) {
  try {
    const { messageId, workspaceId, reason } = await request.json()
    
    if (!messageId || !workspaceId) {
      return NextResponse.json(
        { error: 'Missing messageId or workspaceId' },
        { status: 400 }
      )
    }
    
    const supabase = createCohostServiceClient()
    
    const { error: updateError } = await supabase
      .from('cohost_messages')
      .update({ status: 'escalated' })
      .eq('id', messageId)
      .eq('workspace_id', workspaceId)
    
    if (updateError) {
      console.error('Failed to escalate message:', updateError)
      return NextResponse.json(
        { error: 'Failed to escalate message' },
        { status: 500 }
      )
    }
    
    await supabase
      .from('cohost_actions_audit')
      .insert({
        workspace_id: workspaceId,
        message_id: messageId,
        action_type: 'escalated',
        meta: { reason: reason || 'No reason provided' }
      })
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Escalate error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}