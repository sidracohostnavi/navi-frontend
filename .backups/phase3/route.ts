import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  if (!start || !end) return NextResponse.json({ error: 'Missing range' }, { status: 400 });

  // Use service client for data queries (bypasses RLS for reliable team access)
  const service = createCohostServiceClient();

  const { data: memberships, error: memError } = await service
    .from('cohost_workspace_members')
    .select('workspace_id, can_view_calendar, can_view_guest_name, can_view_guest_count, can_view_booking_notes, can_view_contact_info, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (memError) return NextResponse.json({ error: memError.message }, { status: 500 });

  const allowedMemberships = (memberships || []).filter(m => m.can_view_calendar !== false);
  const allowedWorkspaces = allowedMemberships.map(m => m.workspace_id);

  if (allowedWorkspaces.length === 0) {
    return NextResponse.json({ bookings: [] });
  }

  const { data: bookings, error } = await service
    .from('bookings')
    .select([
      'id',
      'workspace_id',
      'property_id',
      'check_in',
      'check_out',
      'status',
      'source_type',
      'platform',
      'guest_name',
      'guest_first_name',
      'guest_last_initial',
      'guest_count',
      'needs_review',
      'source_feed_id',
      'created_at',
      'manual_connection_id',
      'manual_guest_name',
      'manual_guest_count',
      'manual_notes',
      'manually_resolved_at'
    ].join(','))
    .eq('is_active', true)
    .lt('check_in', end)
    .gt('check_out', start)
    .in('workspace_id', allowedWorkspaces);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const permsByWorkspace = new Map(
    (allowedMemberships as any[]).map((m: any) => [m.workspace_id, m])
  );

  const masked = ((bookings || []) as any[]).map((b: any) => {
    const perms = permsByWorkspace.get(b.workspace_id);
    const canViewGuestName = perms?.can_view_guest_name !== false;
    const canViewGuestCount = perms?.can_view_guest_count !== false;
    const canViewNotes = perms?.can_view_booking_notes !== false;

    return {
      ...b,
      guest_name: canViewGuestName ? b.guest_name : null,
      guest_first_name: canViewGuestName ? b.guest_first_name : null,
      guest_last_initial: canViewGuestName ? b.guest_last_initial : null,
      guest_count: canViewGuestCount ? b.guest_count : null,
      manual_notes: canViewNotes ? b.manual_notes : null,
    };
  });

  return NextResponse.json({ bookings: masked });
}
