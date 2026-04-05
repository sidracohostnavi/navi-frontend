import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { calculatePrice } from '@/lib/services/pricing-service';
import { randomBytes } from 'crypto';
import { sendQuoteEmail } from '@/lib/services/email-service';

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
  const { propertyId, checkIn, checkOut, guestCount, policyId } = body;
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

  // Fetch policy for expiry
  let quoteExpiryHours = 48;
  if (policyId) {
    const { data: policy } = await supabase
      .from('booking_policies')
      .select('quote_expiry_hours')
      .eq('id', policyId)
      .single();
    if (policy) quoteExpiryHours = policy.quote_expiry_hours;
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
  }

  // Generate unique payment link token
  const paymentLinkToken = randomBytes(32).toString('hex');

  // Calculate expiry
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + quoteExpiryHours);

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
      policy_id: policyId || null,
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

  // Send email if guest email provided and sendEmail flag is true
  let emailSent = false;
  if (body.sendEmail && body.guestEmail && hold.payment_link_token) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cohostnavi.com';
    const paymentLink = `${appUrl}/checkout/${hold.payment_link_token}`;
    
    // Get property name
    const { data: property } = await supabase
      .from('cohost_properties')
      .select('name')
      .eq('id', hold.property_id)
      .single();

    // Get policy details for email
    let cancellationPolicy = undefined;
    let rentalAgreement = undefined;
    
    if (hold.policy_id) {
      const { data: policy } = await supabase
        .from('booking_policies')
        .select('cancellation_policy, rental_agreement_text')
        .eq('id', hold.policy_id)
        .single();
      
      if (policy) {
        cancellationPolicy = policy.cancellation_policy || undefined;
        rentalAgreement = policy.rental_agreement_text || undefined;
      }
    }

    emailSent = await sendQuoteEmail({
      to: body.guestEmail,
      guestFirstName: body.guestFirstName || 'Guest',
      propertyName: property?.name || 'Property',
      checkIn: hold.check_in,
      checkOut: hold.check_out,
      totalPrice: hold.total_price || 0,
      paymentLink,
      expiresAt: hold.expires_at,
      cancellationPolicy,
      rentalAgreement,
    });
  }

  return NextResponse.json({
    ...hold,
    emailSent,
    paymentLink: `${process.env.NEXT_PUBLIC_APP_URL || 'https://cohostnavi.com'}/checkout/${hold.payment_link_token}`,
  });
}
