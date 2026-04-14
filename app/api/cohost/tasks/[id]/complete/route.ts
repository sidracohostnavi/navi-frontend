import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

// ─── POST: mark a task as completed (cleaner action) ─────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const service = createCohostServiceClient();

  // Verify caller is an active workspace member
  const { data: member } = await service
    .from('cohost_workspace_members')
    .select('role, is_active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!member?.is_active) {
    return NextResponse.json({ error: 'Inactive member' }, { status: 403 });
  }

  // Fetch the task
  const { data: task } = await service
    .from('property_tasks')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .single();

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Cleaners can only complete tasks assigned to them
  const role = member.role as string;
  if (role === 'cleaner' && task.assigned_user_id !== user.id) {
    return NextResponse.json({ error: 'You are not assigned to this task' }, { status: 403 });
  }

  const body = await request.json();
  const { hours_worked, completion_note } = body;

  // Look up hourly rate for this user in this workspace
  const { data: payRate } = await service
    .from('team_pay_rates')
    .select('hourly_rate')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  const hourlyRate = payRate?.hourly_rate ? parseFloat(payRate.hourly_rate) : 0;
  const hoursNum = hours_worked ? parseFloat(hours_worked) : null;
  const calculatedAmountOwed = (hoursNum && hourlyRate > 0)
    ? parseFloat((hoursNum * hourlyRate).toFixed(2))
    : null;

  const completedAt = new Date().toISOString();

  // Insert completion record
  const { data: completion, error: completionError } = await service
    .from('task_completions')
    .insert({
      task_id: id,
      completed_by_user_id: user.id,
      completed_at: completedAt,
      hours_worked: hoursNum,
      completion_note: completion_note?.trim() || null,
      calculated_amount_owed: calculatedAmountOwed,
    })
    .select()
    .single();

  if (completionError) {
    return NextResponse.json({ error: completionError.message }, { status: 400 });
  }

  // Update task: last_completed_at + next_due_at (for recurring)
  const taskUpdates: Record<string, any> = {
    last_completed_at: completedAt,
    updated_at: completedAt,
  };

  if (task.task_type === 'recurring' && task.recurrence_days) {
    const nextDue = new Date(completedAt);
    nextDue.setDate(nextDue.getDate() + task.recurrence_days);
    taskUpdates.next_due_at = nextDue.toISOString();
  }

  await service
    .from('property_tasks')
    .update(taskUpdates)
    .eq('id', id);

  return NextResponse.json({ completion }, { status: 201 });
}
