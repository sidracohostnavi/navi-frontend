// /app/api/cohost/approve/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'

export async function POST(request: NextRequest) {
  try {
    const { messageId, workspaceId, finalReply } = await request.json()
    
    if (!messageId || !workspaceId) {
      return NextResponse.json(
        { error: 'Missing messageId or workspaceId' },
        { status: 400 }
      )
    }
    
    const supabase = createCohostServiceClient()
    
    const { error: updateError } = await supabase
      .from('cohost_messages')
      .update({ status: 'approved' })
      .eq('id', messageId)
      .eq('workspace_id', workspaceId)
    
    if (updateError) {
      console.error('Failed to approve message:', updateError)
      return NextResponse.json(
        { error: 'Failed to approve message' },
        { status: 500 }
      )
    }
    
    if (finalReply) {
      await supabase
        .from('cohost_drafts')
        .insert({
          workspace_id: workspaceId,
          message_id: messageId,
          model: 'human-edited',
          draft_text: finalReply,
          risk_level: 'low',
          recommended_action: 'Approved by user'
        })
    }
    
    await supabase
      .from('cohost_actions_audit')
      .insert({
        workspace_id: workspaceId,
        message_id: messageId,
        action_type: 'approved',
        meta: { final_reply_length: finalReply?.length || 0 }
      })
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Approve error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}