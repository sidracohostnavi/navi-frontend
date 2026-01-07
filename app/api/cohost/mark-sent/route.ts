// /app/api/cohost/mark-sent/route.ts
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
    
    const { error: updateError } = await supabase
      .from('cohost_messages')
      .update({ status: 'sent' })
      .eq('id', messageId)
      .eq('workspace_id', workspaceId)
    
    if (updateError) {
      console.error('Failed to mark message as sent:', updateError)
      return NextResponse.json(
        { error: 'Failed to mark as sent' },
        { status: 500 }
      )
    }
    
    await supabase
      .from('cohost_actions_audit')
      .insert({
        workspace_id: workspaceId,
        message_id: messageId,
        action_type: 'marked_sent',
        meta: { method: 'manual_copy_paste' }
      })
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Mark sent error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}