import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceRoleClient = createCohostServiceClient();
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { 
      propertyId, 
      checkIn, 
      checkOut, 
      guestName, 
      guestEmail, 
      guestPhone,
      guestCount,
      customPrice,
      notes,
    } = body;
    
    // Validate required fields
    if (!propertyId || !checkIn || !checkOut || !guestName || !guestEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Get property and verify access
    const { data: property } = await supabase
      .from('cohost_properties')
      .select('id, workspace_id, nightly_rate, cleaning_fee, name, direct_booking_enabled')
      .eq('id', propertyId)
      .single();
    
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }
    
    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('cohost_workspace_members')
      .select('role')
      .eq('workspace_id', property.workspace_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin', 'operator'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    
    // Verify Stripe is connected
    const { data: workspace } = await supabase
      .from('cohost_workspaces')
      .select('stripe_onboarding_complete')
      .eq('id', property.workspace_id)
      .single();
    
    if (!workspace?.stripe_onboarding_complete) {
      return NextResponse.json({ error: 'Stripe not connected' }, { status: 400 });
    }
    
    // Check availability (Only against CONFIRMED bookings or active holds)
    // Non-confirmed host-initiated bookings (pending_payment) DO NOT block dates.
    const { data: conflicts } = await supabase
      .from('bookings')
      .select('id')
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .eq('status', 'confirmed')
      .lt('check_in', `${checkOut}T12:00:00Z`)
      .gt('check_out', `${checkIn}T12:00:00Z`)
      .limit(1);
    
    if (conflicts && conflicts.length > 0) {
      return NextResponse.json({ error: 'Dates already confirmed for another booking' }, { status: 409 });
    }
    
    // Calculate price
    const nights = Math.ceil(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    let totalPrice = customPrice;
    if (!totalPrice && property.nightly_rate) {
      totalPrice = (nights * property.nightly_rate) + (property.cleaning_fee || 0);
    }
    
    if (!totalPrice) {
      return NextResponse.json({ error: 'Price required' }, { status: 400 });
    }
    
    // Generate payment link token using native crypto
    const paymentLinkToken = crypto.randomUUID();
    const externalUid = `direct-host-${crypto.randomUUID()}`;
    
    // Create booking (using service role to ensure it bypasses any restrictive RLS)
    const { data: booking, error: insertError } = await serviceRoleClient
      .from('bookings')
      .insert({
        workspace_id: property.workspace_id,
        property_id: propertyId,
        guest_name: guestName,
        check_in: `${checkIn}T12:00:00Z`,
        check_out: `${checkOut}T12:00:00Z`,
        external_uid: externalUid,
        source: 'direct',
        status: 'pending_payment',
        is_active: true,
        guest_email: guestEmail,
        guest_phone: guestPhone || null,
        total_price: totalPrice,
        payment_link_token: paymentLinkToken,
        created_by_user_id: user.id,
        notes: notes || null,
        guest_count: guestCount || 1,
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('Failed to create booking:', insertError);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }
    
    const paymentUrl = `${process.env.NEXT_PUBLIC_APP_URL}/pay/${paymentLinkToken}`;
    
    return NextResponse.json({
      booking,
      paymentUrl,
      paymentLinkToken,
    });
    
  } catch (error: any) {
    console.error('Create booking error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
