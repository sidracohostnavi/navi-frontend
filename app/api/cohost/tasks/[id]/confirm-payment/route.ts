import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

// ─── POST: host confirms payment for a task completion ────────────────────────
// Body: { completion_id: string }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: taskId } = await params;
  const service = createCohostServiceClient();

  // Only owner/admin can confirm payments
  const { data: member } = await service
    .from('cohost_workspace_members')
    .select('role, is_active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!member?.is_active || !['owner', 'admin'].includes(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { completion_id } = body;

  if (!completion_id) {
    return NextResponse.json({ error: 'completion_id is required' }, { status: 400 });
  }

  // Verify the completion belongs to a task in this workspace
  const { data: task } = await service
    .from('property_tasks')
    .select('id')
    .eq('id', taskId)
    .eq('workspace_id', workspaceId)
    .single();

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const { data: completion, error } = await service
    .from('task_completions')
    .update({
      host_payment_confirmed_at: new Date().toISOString(),
      host_payment_confirmed_by: user.id,
    })
    .eq('id', completion_id)
    .eq('task_id', taskId)
    .is('host_payment_confirmed_at', null)
    .select()
    .single();

  if (error || !completion) {
    return NextResponse.json({ error: error?.message || 'Not found or already confirmed' }, { status: 400 });
  }

  return NextResponse.json({ completion });
}
