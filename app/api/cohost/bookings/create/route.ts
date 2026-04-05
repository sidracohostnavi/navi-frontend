import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { calculatePrice } from '@/lib/services/pricing-service';

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

  if (!membership || !['owner', 'manager', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { 
    propertyId, 
    checkIn, 
    checkOut, 
    guestCount,
    guestFirstName,
    guestLastName,
    guestEmail,
    guestPhone,
    source,
    notes,
    totalPrice, // Optional: override calculated price
  } = body;

  if (!propertyId || !checkIn || !checkOut || !guestFirstName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Check for overlapping bookings
  const { data: overlapping } = await supabase
    .from('bookings')
    .select('id')
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .lt('check_in', checkOut)
    .gt('check_out', checkIn)
    .limit(1);

  if (overlapping && overlapping.length > 0) {
    return NextResponse.json({ error: 'Dates overlap with existing booking' }, { status: 409 });
  }

  // Calculate price if not provided
  let finalPrice = totalPrice;
  if (!finalPrice) {
    try {
      const priceBreakdown = await calculatePrice({
        propertyId,
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        guestCount: guestCount || 1,
        workspaceId: membership.workspace_id,
      }, supabase);
      finalPrice = priceBreakdown.grandTotal;
    } catch (e) {
      // Price calculation optional for instant booking
      console.log('Price calculation failed, proceeding without price');
    }
  }

  const guestName = `${guestFirstName} ${guestLastName || ''}`.trim();

  // Create booking directly (no hold, no payment)
  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      workspace_id: membership.workspace_id,
      property_id: propertyId,
      check_in: checkIn,
      check_out: checkOut,
      guest_name: guestName,
      guest_count: guestCount || 1,
      guest_email: guestEmail || null,
      guest_phone: guestPhone || null,
      total_price: finalPrice || null,
      status: 'confirmed',
      source: 'direct',
      source_type: 'direct',
      platform: source || 'Direct Booking',
      is_active: true,
      created_by_user_id: user.id,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create booking:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(booking);
}
