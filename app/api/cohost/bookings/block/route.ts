import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await supabase
    .from('cohost_workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { propertyId, checkIn, checkOut, reason } = body;

  if (!propertyId || !checkIn || !checkOut) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Check for overlapping bookings
  const { data: overlapping } = await supabase
    .from('bookings')
    .select('id')
    .eq('propertyId', propertyId)
    .eq('is_active', true)
    .lt('startDate', checkOut)
    .gt('endDate', checkIn)
    .limit(1);

  if (overlapping && overlapping.length > 0) {
    return NextResponse.json({ error: 'Dates overlap with existing booking' }, { status: 409 });
  }

  // Create blocked period as a booking
  const { data: block, error } = await supabase
    .from('bookings')
    .insert({
      workspaceId: membership.workspace_id,
      propertyId: propertyId,
      startDate: checkIn,
      endDate: checkOut,
      guestName: reason || 'Blocked',
      guestCount: 0,
      status: 'confirmed',
      channel: 'direct',
      sourceType: 'direct',
      platformName: 'Owner Block',
      is_active: true,
      created_by_user_id: user.id,
      notes: reason,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create block:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(block);
}
