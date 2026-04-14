import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

// ─── GET: list tasks for the current user's workspace ────────────────────────
export async function GET() {
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createCohostServiceClient();

  // Determine caller's role
  const { data: member } = await service
    .from('cohost_workspace_members')
    .select('role, is_active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!member?.is_active) {
    return NextResponse.json({ error: 'Inactive member' }, { status: 403 });
  }

  const role = member.role as string;
  const isCleaner = role === 'cleaner';

  // Fetch tasks
  let query = service
    .from('property_tasks')
    .select('*, property:cohost_properties(id, name)')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });

  if (isCleaner) {
    query = query.eq('assigned_user_id', user.id);
  }

  const { data: tasks, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Fetch latest completion per task (for host view: all; for cleaner: only theirs)
  const taskIds = (tasks || []).map((t: any) => t.id);
  let completions: any[] = [];
  if (taskIds.length > 0) {
    const { data: allCompletions } = await service
      .from('task_completions')
      .select('*')
      .in('task_id', taskIds)
      .order('completed_at', { ascending: false });
    completions = allCompletions || [];
  }

  // Map latest completion per task
  const latestByTask = new Map<string, any>();
  for (const c of completions) {
    if (!latestByTask.has(c.task_id)) {
      latestByTask.set(c.task_id, c);
    }
  }

  // Collect unique user IDs to resolve display names
  const userIds = new Set<string>();
  for (const t of tasks || []) {
    if (t.assigned_user_id) userIds.add(t.assigned_user_id);
    if (t.created_by) userIds.add(t.created_by);
  }
  for (const c of completions) {
    if (c.completed_by_user_id) userIds.add(c.completed_by_user_id);
  }

  // Batch-resolve emails via admin API
  const emailMap = new Map<string, string>();
  await Promise.all(
    Array.from(userIds).map(async (uid) => {
      const { data } = await service.auth.admin.getUserById(uid);
      if (data.user?.email) emailMap.set(uid, data.user.email);
    })
  );

  const now = new Date();

  // Enrich tasks
  const enriched = (tasks || []).map((t: any) => {
    const effectiveDue = t.task_type === 'recurring' ? t.next_due_at : t.due_at;
    const isOverdue = effectiveDue ? new Date(effectiveDue) < now : false;

    const latestCompletion = latestByTask.get(t.id) || null;

    return {
      ...t,
      property_name: t.property?.name || null,
      assigned_user_email: t.assigned_user_id ? (emailMap.get(t.assigned_user_id) || null) : null,
      created_by_email: emailMap.get(t.created_by) || null,
      is_overdue: isOverdue,
      effective_due_at: effectiveDue || null,
      latest_completion: latestCompletion ? {
        ...latestCompletion,
        completed_by_email: emailMap.get(latestCompletion.completed_by_user_id) || null,
      } : null,
    };
  });

  return NextResponse.json({ tasks: enriched, role, currentUserId: user.id });
}

// ─── POST: create a new task ──────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createCohostServiceClient();

  // Only owner/admin/manager can create tasks
  const { data: member } = await service
    .from('cohost_workspace_members')
    .select('role, is_active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!member?.is_active || !['owner', 'admin', 'manager'].includes(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const {
    title,
    description,
    property_id,
    assigned_user_id,
    task_type,
    recurrence_days,
    due_at,
  } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (task_type === 'recurring' && (!recurrence_days || recurrence_days < 1)) {
    return NextResponse.json({ error: 'Recurrence interval is required for recurring tasks' }, { status: 400 });
  }

  // Compute initial next_due_at
  let next_due_at: string | null = null;
  if (task_type === 'recurring' && recurrence_days) {
    const d = new Date();
    d.setDate(d.getDate() + recurrence_days);
    next_due_at = d.toISOString();
  } else if (task_type === 'one_off' && due_at) {
    next_due_at = due_at;
  }

  const { data: task, error } = await service
    .from('property_tasks')
    .insert({
      workspace_id: workspaceId,
      property_id: property_id || null,
      assigned_user_id: assigned_user_id || null,
      created_by: user.id,
      title: title.trim(),
      description: description?.trim() || null,
      task_type: task_type || 'one_off',
      recurrence_days: task_type === 'recurring' ? recurrence_days : null,
      due_at: task_type === 'one_off' ? (due_at || null) : null,
      next_due_at,
      status: 'active',
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ task }, { status: 201 });
}
