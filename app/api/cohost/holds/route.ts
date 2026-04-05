import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { calculatePrice } from '@/lib/services/pricing-service';
import { randomBytes } from 'crypto';

export async function GET(request: Request) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { data: membership } = await supabase
    .from('cohost_workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single();
    
  if (!membership) return NextResponse.json({ error: 'No workspace' }, { status: 400 });
  
  // Get active holds (pending or draft)
  const { data, error } = await supabase
    .from('booking_holds')
    .select('*, cohost_properties(name)')
    .eq('workspace_id', membership.workspace_id)
    .in('status', ['draft', 'pending'])
    .order('created_at', { ascending: false });
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

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

  // Validate required fields
  const { propertyId, checkIn, checkOut, guestCount } = body;
  if (!propertyId || !checkIn || !checkOut) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Check for overlapping active bookings
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

  // Calculate price
  let priceBreakdown = null;
  let totalPrice = null;
  
  try {
    priceBreakdown = await calculatePrice({
      propertyId,
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      guestCount: guestCount || 1,
      workspaceId: membership.workspace_id,
    }, supabase);
    totalPrice = priceBreakdown.grandTotal;
  } catch (e: any) {
    console.error('Price calculation failed:', e.message);
    // Continue without price if calculation fails
  }

  // Generate unique payment link token
  const paymentLinkToken = randomBytes(32).toString('hex');

  // Calculate expiry (48 hours from now)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  // Create hold
  const { data: hold, error } = await supabase
    .from('booking_holds')
    .insert({
      workspace_id: membership.workspace_id,
      property_id: propertyId,
      check_in: checkIn,
      check_out: checkOut,
      guest_count: guestCount || 1,
      guest_first_name: body.guestFirstName || null,
      guest_last_name: body.guestLastName || null,
      guest_email: body.guestEmail || null,
      guest_phone: body.guestPhone || null,
      guest_country: body.guestCountry || null,
      guest_language: body.guestLanguage || 'English',
      source: body.source || null,
      notes: body.notes || null,
      total_price: totalPrice,
      price_breakdown: priceBreakdown,
      policy_id: body.policyId || null,
      payment_link_token: paymentLinkToken,
      status: body.sendQuote ? 'pending' : 'draft',
      expires_at: expiresAt.toISOString(),
      session_id: user.id, // Use user ID as session
      created_by_user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create hold:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(hold);
}
