import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const body = await request.json();
  const { id: bookingId } = await params;

  // Get user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get user's role
  const { data: membership } = await supabase
    .from('cohost_workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get current booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*, cohost_properties(workspace_id)')
    .eq('id', bookingId)
    .single();

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // Verify booking belongs to user's workspace
  if (booking.cohost_properties?.workspace_id !== membership.workspace_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Only direct bookings can be edited
  if (booking.source !== 'direct') {
    return NextResponse.json({ error: 'Only direct bookings can be edited here.' }, { status: 400 });
  }

  const { guestName, startDate, endDate, guestCount, totalPrice } = body;

  // If dates are changing, check for overlaps
  if (startDate || endDate) {
    const finalStart = startDate || booking.startDate;
    const finalEnd = endDate || booking.endDate;

    const { data: overlapping } = await supabase
      .from('bookings')
      .select('id')
      .eq('property_id', booking.property_id)
      .eq('is_active', true)
      .neq('id', bookingId) // Exclude current booking
      .lt('check_in', finalEnd)
      .gt('check_out', finalStart)
      .limit(1);

    if (overlapping && overlapping.length > 0) {
      return NextResponse.json({ error: 'New dates overlap with an existing booking' }, { status: 409 });
    }
  }

  // Update booking
  const { data: updated, error: updateError } = await supabase
    .from('bookings')
    .update({
      guest_name: guestName ?? booking.guest_name,
      check_in: startDate ?? booking.check_in,
      check_out: endDate ?? booking.check_out,
      guest_count: guestCount ?? booking.guest_count,
      total_price: totalPrice ?? booking.total_price,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 });
  }

  return NextResponse.json(updated);
}
