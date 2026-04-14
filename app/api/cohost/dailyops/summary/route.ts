import { NextResponse } from 'next/server';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createCohostServiceClient();

  // Caller's role & active check
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

  // ─── Property access filter for cleaners ──────────────────────────────────
  let allowedPropertyIds: string[] | null = null;
  if (isCleaner) {
    const { data: userProps } = await service
      .from('cohost_user_properties')
      .select('property_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id);
    allowedPropertyIds = (userProps || []).map((r: any) => r.property_id);
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lookahead = new Date(now);
  lookahead.setDate(lookahead.getDate() + 30);

  // ─── Upcoming cleanings (bookings checking out in next 30 days) ───────────
  // Include yesterday so "today" check-outs are always shown
  const windowStart = new Date(now);
  windowStart.setHours(0, 0, 0, 0);

  let bookingQuery = service
    .from('bookings')
    .select('id, property_id, guest_name, check_in, check_out, status')
    .eq('workspace_id', workspaceId)
    .neq('status', 'cancelled')
    .gte('check_out', windowStart.toISOString())
    .lte('check_out', lookahead.toISOString())
    .order('check_out', { ascending: true });

  if (allowedPropertyIds !== null) {
    if (allowedPropertyIds.length === 0) {
      return NextResponse.json({
        cleanings: [],
        completedCleanings: [],
        tasks: [],
        completedTasks: [],
        role,
        currentUserId: user.id,
      });
    }
    bookingQuery = bookingQuery.in('property_id', allowedPropertyIds);
  }

  const { data: upcomingBookings } = await bookingQuery;

  // Also fetch all future check-ins (to calculate cleaning windows)
  let futureCheckinsQuery = service
    .from('bookings')
    .select('id, property_id, check_in')
    .eq('workspace_id', workspaceId)
    .neq('status', 'cancelled')
    .gte('check_in', windowStart.toISOString())
    .order('check_in', { ascending: true });

  if (allowedPropertyIds !== null && allowedPropertyIds.length > 0) {
    futureCheckinsQuery = futureCheckinsQuery.in('property_id', allowedPropertyIds);
  }

  const { data: futureCheckins } = await futureCheckinsQuery;

  // ─── Cleaning completions for these bookings ──────────────────────────────
  const upcomingBookingIds = (upcomingBookings || []).map((b: any) => b.id);
  let completionMap = new Map<string, any>();
  if (upcomingBookingIds.length > 0) {
    const { data: completions } = await service
      .from('cleaning_completions')
      .select('*')
      .in('booking_id', upcomingBookingIds);
    for (const c of completions || []) {
      completionMap.set(c.booking_id, c);
    }
  }

  // ─── Properties for names, times, and cleaning buffer days ──────────────
  let propQuery = service
    .from('cohost_properties')
    .select('id, name, check_in_time, check_out_time, cleaning_post_days, cleaning_pre_days')
    .eq('workspace_id', workspaceId);
  if (allowedPropertyIds !== null && allowedPropertyIds.length > 0) {
    propQuery = propQuery.in('id', allowedPropertyIds);
  }
  const { data: properties } = await propQuery;
  // propMap: id → { name, check_in_time, check_out_time, cleaning_post_days, cleaning_pre_days }
  const propMap = new Map((properties || []).map((p: any) => [p.id, p]));

  // Apply a property's standard time (HH:MM 24h) to a booking date ISO string.
  function applyPropTime(dateIso: string, timeStr: string | null): string {
    if (!timeStr) return dateIso;
    const datePart = dateIso.split('T')[0];
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(`${datePart}T00:00:00`);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }

  // Policy-based cleaning deadline: checkout_date + buffer_days at check_in_time.
  // This is the "clean by" time that cleaners should target, derived from the
  // host's preparation_time_days policy — independent of actual next booking.
  function computeWindowEnd(
    checkoutDateIso: string,
    checkinTime: string | null,
    bufferDays: number
  ): string | null {
    if (!checkinTime) return null;
    const datePart = checkoutDateIso.split('T')[0];
    const [h, m] = checkinTime.split(':').map(Number);
    const d = new Date(`${datePart}T00:00:00`);
    d.setDate(d.getDate() + bufferDays);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }

  // Cleaning window = hours from (checkout date at check_out_time)
  // to (checkout date + buffer days at check_in_time).
  // Buffer = cleaning_post_days only — pre and post blocks overlap on the
  // checkout date itself, so only post_days determines how many days are
  // actually added before the next check-in can occur.
  function computeWindowHours(
    checkoutDateIso: string,
    checkoutTime: string | null,
    checkinTime: string | null,
    bufferDays: number
  ): number | null {
    if (!checkoutTime || !checkinTime) return null;
    const datePart = checkoutDateIso.split('T')[0];
    const [coH, coM] = checkoutTime.split(':').map(Number);
    const [ciH, ciM] = checkinTime.split(':').map(Number);
    const start = new Date(`${datePart}T00:00:00`);
    start.setHours(coH, coM, 0, 0);
    const end = new Date(`${datePart}T00:00:00`);
    end.setDate(end.getDate() + bufferDays);
    end.setHours(ciH, ciM, 0, 0);
    const ms = end.getTime() - start.getTime();
    return ms > 0 ? ms / 3600000 : 0;
  }

  // Build next-checkin map: property_id → sorted upcoming check_in dates
  // Use date-only comparison so same-day turnovers are found correctly.
  const checkinsByProp = new Map<string, string[]>(); // property_id → sorted check_in date strings
  for (const b of futureCheckins || []) {
    if (!checkinsByProp.has(b.property_id)) checkinsByProp.set(b.property_id, []);
    checkinsByProp.get(b.property_id)!.push(b.check_in);
  }
  // Sort each list ascending
  for (const [, list] of checkinsByProp) {
    list.sort((a, z) => new Date(a).getTime() - new Date(z).getTime());
  }

  const cleanings = (upcomingBookings || []).map((b: any) => {
    const prop = propMap.get(b.property_id) as any;
    const checkoutTime = prop?.check_out_time || null;
    const checkinTime = prop?.check_in_time || null;
    const timesMissing = !checkoutTime || !checkinTime;
    const bufferDays = prop?.cleaning_post_days || 0;

    // Effective checkout: booking date + property checkout time
    const effectiveCheckout = applyPropTime(b.check_out, checkoutTime);
    // Effective check-in for this booking (for Today tab display)
    const effectiveCheckin = applyPropTime(b.check_in, checkinTime);

    // Cleaning window: purely from property policy (buffer days + times)
    const cleaningWindowHours = computeWindowHours(b.check_out, checkoutTime, checkinTime, bufferDays);
    // Policy-based deadline — checkout_date + prep_days at check-in time
    const cleaningWindowEnd = computeWindowEnd(b.check_out, checkinTime, bufferDays);

    // Next actual booking check-in for this property (date >= checkout date, different booking)
    // Compare by date string so same-day turnovers are found
    const checkoutDate = b.check_out.split('T')[0];
    const nextCheckinRaw = (checkinsByProp.get(b.property_id) || [])
      .find(ci => ci.split('T')[0] >= checkoutDate) || null;
    const effectiveNextCheckin = nextCheckinRaw
      ? applyPropTime(nextCheckinRaw, checkinTime)
      : null;

    const completion = completionMap.get(b.id) || null;

    return {
      booking_id: b.id,
      property_id: b.property_id,
      property_name: prop?.name || null,
      guest_name: b.guest_name,
      check_in: effectiveCheckin,
      check_out: effectiveCheckout,
      next_checkin: effectiveNextCheckin,
      cleaning_window_hours: cleaningWindowHours,
      cleaning_window_end: cleaningWindowEnd,
      times_missing: timesMissing,
      is_completed: !!completion,
      completed_at: completion?.completed_at || null,
      completed_by_user_id: completion?.completed_by_user_id || null,
      // Payment tracking fields
      hours_worked: completion?.hours_worked ?? null,
      calculated_amount_owed: completion?.calculated_amount_owed ?? null,
      extra_expense_amount: completion?.extra_expense_amount ?? null,
      extra_expense_description: completion?.extra_expense_description ?? null,
      completion_note: completion?.completion_note ?? null,
      payment_status: completion?.payment_status ?? null,
      paid_at: completion?.paid_at ?? null,
    };
  });

  // ─── Completed cleanings this month ──────────────────────────────────────
  const { data: completedCleaningsRaw } = await service
    .from('cleaning_completions')
    .select('id, booking_id, completed_by_user_id, completed_at')
    .eq('workspace_id', workspaceId)
    .gte('completed_at', monthStart)
    .order('completed_at', { ascending: false });

  // Enrich with booking/property info
  const completedBookingIds = (completedCleaningsRaw || []).map((c: any) => c.booking_id);
  let completedBookings: any[] = [];
  if (completedBookingIds.length > 0) {
    const { data } = await service
      .from('bookings')
      .select('id, property_id, check_in, check_out, guest_name')
      .in('id', completedBookingIds);
    completedBookings = data || [];
  }
  const completedBookingMap = new Map(completedBookings.map((b: any) => [b.id, b]));

  // ─── Active tasks ─────────────────────────────────────────────────────────
  let taskQuery = service
    .from('property_tasks')
    .select('*, property:cohost_properties(id, name)')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });

  if (isCleaner) {
    taskQuery = taskQuery.eq('assigned_user_id', user.id);
  }

  const { data: tasks } = await taskQuery;

  // Latest completion per task
  const taskIds = (tasks || []).map((t: any) => t.id);
  let latestCompletionMap = new Map<string, any>();
  if (taskIds.length > 0) {
    const { data: latestCompletions } = await service
      .from('task_completions')
      .select('*')
      .in('task_id', taskIds)
      .order('completed_at', { ascending: false });
    for (const c of latestCompletions || []) {
      if (!latestCompletionMap.has(c.task_id)) latestCompletionMap.set(c.task_id, c);
    }
  }

  // ─── Completed tasks this month ───────────────────────────────────────────
  let completedTaskQuery = service
    .from('task_completions')
    .select('id, task_id, completed_by_user_id, completed_at, hours_worked, calculated_amount_owed, completion_note')
    .gte('completed_at', monthStart)
    .order('completed_at', { ascending: false });

  // We need to join with property_tasks to filter by workspace + optionally cleaner
  // Supabase doesn't support cross-table filtering in one query easily, so fetch and filter
  const { data: allCompletedTasks } = await completedTaskQuery;

  // Filter to only tasks in this workspace (and for cleaner: only their completions)
  const workspaceTaskIds = new Set(taskIds);
  // Also need completed tasks for tasks that may now be inactive/cancelled
  // Fetch all workspace task IDs for the month filter
  const { data: allWorkspaceTasks } = await service
    .from('property_tasks')
    .select('id, title, property_id, task_type, property:cohost_properties(id, name)')
    .eq('workspace_id', workspaceId);
  const allWorkspaceTaskMap = new Map((allWorkspaceTasks || []).map((t: any) => [t.id, t]));
  const allWorkspaceTaskIds = new Set(allWorkspaceTaskMap.keys());

  const completedTasks = (allCompletedTasks || [])
    .filter((c: any) => {
      if (!allWorkspaceTaskIds.has(c.task_id)) return false;
      if (isCleaner && c.completed_by_user_id !== user.id) return false;
      return true;
    })
    .map((c: any) => {
      const task = allWorkspaceTaskMap.get(c.task_id);
      return {
        ...c,
        task_title: task?.title || null,
        task_type: task?.task_type || null,
        property_name: task?.property?.name || null,
      };
    });

  // ─── Resolve emails for completions ──────────────────────────────────────
  const userIdSet = new Set<string>();
  // Include cleaner emails for active cleanings with completions
  for (const c of cleanings) {
    if (c.completed_by_user_id) userIdSet.add(c.completed_by_user_id);
  }
  for (const c of completedCleaningsRaw || []) userIdSet.add(c.completed_by_user_id);
  for (const c of completedTasks) userIdSet.add(c.completed_by_user_id);

  const emailMap = new Map<string, string>();
  await Promise.all(
    Array.from(userIdSet).map(async (uid) => {
      const { data } = await service.auth.admin.getUserById(uid);
      if (data.user?.email) emailMap.set(uid, data.user.email);
    })
  );

  // Also resolve emails for task assignees
  const taskAssigneeIds = new Set<string>();
  for (const t of tasks || []) {
    if (t.assigned_user_id) taskAssigneeIds.add(t.assigned_user_id);
  }
  await Promise.all(
    Array.from(taskAssigneeIds).map(async (uid) => {
      if (!emailMap.has(uid)) {
        const { data } = await service.auth.admin.getUserById(uid);
        if (data.user?.email) emailMap.set(uid, data.user.email);
      }
    })
  );

  const completedCleanings = (completedCleaningsRaw || []).map((c: any) => {
    const booking = completedBookingMap.get(c.booking_id);
    return {
      id: c.id,
      booking_id: c.booking_id,
      property_name: booking ? (propMap.get(booking.property_id) || null) : null,
      check_out: booking?.check_out || null,
      completed_at: c.completed_at,
      completed_by_email: emailMap.get(c.completed_by_user_id) || null,
    };
  });

  const completedTasksEnriched = completedTasks.map((c: any) => ({
    ...c,
    completed_by_email: emailMap.get(c.completed_by_user_id) || null,
  }));

  // Enrich active tasks
  const nowDt = new Date();
  const enrichedTasks = (tasks || []).map((t: any) => {
    const effectiveDue = t.task_type === 'recurring' ? t.next_due_at : t.due_at;
    const isOverdue = effectiveDue ? new Date(effectiveDue) < nowDt : false;
    return {
      ...t,
      property_name: t.property?.name || null,
      assigned_user_email: t.assigned_user_id ? (emailMap.get(t.assigned_user_id) || null) : null,
      is_overdue: isOverdue,
      effective_due_at: effectiveDue || null,
      latest_completion: latestCompletionMap.get(t.id) || null,
    };
  });

  // Attach cleaner email to each active cleaning
  const cleaningsEnriched = cleanings.map((c: any) => ({
    ...c,
    completed_by_email: c.completed_by_user_id ? (emailMap.get(c.completed_by_user_id) || null) : null,
  }));

  return NextResponse.json({
    cleanings: cleaningsEnriched,
    completedCleanings,
    tasks: enrichedTasks,
    completedTasks: completedTasksEnriched,
    role,
    currentUserId: user.id,
  });
}
