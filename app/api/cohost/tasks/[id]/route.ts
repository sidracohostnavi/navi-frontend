import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

// ─── PATCH: update or cancel a task ──────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const service = createCohostServiceClient();

  // Role check
  const { data: member } = await service
    .from('cohost_workspace_members')
    .select('role, is_active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!member?.is_active || !['owner', 'admin', 'manager'].includes(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verify task belongs to this workspace
  const { data: existing } = await service
    .from('property_tasks')
    .select('id, workspace_id')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const body = await request.json();
  const allowed = ['title', 'description', 'property_id', 'assigned_user_id', 'status',
    'task_type', 'recurrence_days', 'due_at', 'next_due_at', 'is_active'];

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data: task, error } = await service
    .from('property_tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ task });
}
