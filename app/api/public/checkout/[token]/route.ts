import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  console.log('[Checkout API] Looking up token:', token);

  if (!token) {
    console.error('[Checkout API] Missing token');
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const supabase = createCohostServiceClient();

  // Find hold by payment token
  const { data: hold, error } = await supabase
    .from('booking_holds')
    .select(`*`)
    .eq('payment_link_token', token)
    .single();

  if (error || !hold) {
    console.error('[Checkout API] Hold not found for token:', token, 'Error:', error?.message);
    return NextResponse.json({ error: 'Invalid payment link' }, { status: 404 });
  }

  console.log('[Checkout API] Hold found:', hold.id, 'Status:', hold.status);

  // Fetch property details separately
  const { data: property } = await supabase
    .from('cohost_properties')
    .select('name, address, street_address')
    .eq('id', hold.property_id)
    .single();

  // Fetch policy details separately
  let policy = null;
  if (hold.policy_id) {
    const { data: policyData } = await supabase
      .from('booking_policies')
      .select('name, payment_policy, cancellation_policy')
      .eq('id', hold.policy_id)
      .single();
    policy = policyData;
  }

  // Check if hold is still valid
  if (hold.status !== 'pending') {
    const errorMap: Record<string, string> = {
      converted: 'This booking has already been paid',
      expired: 'This quote has expired',
      cancelled: 'This quote has been cancelled',
      superseded: 'These dates are no longer available',
    };
    return NextResponse.json({ error: errorMap[hold.status] || 'Invalid quote status' }, { status: 400 });
  }

  // Check expiry
  if (new Date(hold.expires_at) < new Date()) {
    // Mark as expired
    await supabase
      .from('booking_holds')
      .update({ status: 'expired' })
      .eq('id', hold.id);

    return NextResponse.json({ error: 'This quote has expired' }, { status: 400 });
  }

  // Check for overlapping bookings (in case someone else booked these dates)
  const { data: overlapping } = await supabase
    .from('bookings')
    .select('id')
    .eq('property_id', hold.property_id)
    .eq('is_active', true)
    .lt('check_in', hold.check_out)
    .gt('check_out', hold.check_in)
    .limit(1);

  if (overlapping && overlapping.length > 0) {
    // Mark hold as superseded
    await supabase
      .from('booking_holds')
      .update({ status: 'superseded' })
      .eq('id', hold.id);

    return NextResponse.json({ error: 'These dates are no longer available' }, { status: 400 });
  }

  // Get workspace's Stripe account
  const { data: workspace } = await supabase
    .from('cohost_workspaces')
    .select('stripe_account_id')
    .eq('id', hold.workspace_id)
    .single();

  if (!workspace?.stripe_account_id) {
    return NextResponse.json({ error: 'Payment not available for this host' }, { status: 400 });
  }

  // Create or retrieve PaymentIntent
  let clientSecret: string;
  let paymentIntentId: string;

  try {
    if (hold.stripe_payment_intent_id) {
      // Retrieve existing PaymentIntent
      try {
        const pi = await stripe.paymentIntents.retrieve(
          hold.stripe_payment_intent_id,
          { stripeAccount: workspace.stripe_account_id }
        );
        clientSecret = pi.client_secret!;
        paymentIntentId = pi.id;
      } catch (e) {
        // If PI doesn't exist, create new one
        const pi = await createPaymentIntent(hold, workspace.stripe_account_id);
        clientSecret = pi.client_secret!;
        paymentIntentId = pi.id;
        
        // Update hold with new PI
        await supabase
          .from('booking_holds')
          .update({ stripe_payment_intent_id: pi.id })
          .eq('id', hold.id);
      }
    } else {
      // Create new PaymentIntent
      const pi = await createPaymentIntent(hold, workspace.stripe_account_id);
      clientSecret = pi.client_secret!;
      paymentIntentId = pi.id;

      // Update hold with PI
      await supabase
        .from('booking_holds')
        .update({ stripe_payment_intent_id: pi.id })
        .eq('id', hold.id);
    }
  } catch (stripeErr: any) {
    console.error('Stripe error:', stripeErr);
    return NextResponse.json({ error: 'Failed to initialize payment: ' + stripeErr.message }, { status: 500 });
  }

  // Format response
  const response = {
    hold: {
      id: hold.id,
      property_name: property?.name,
      property_address: property?.street_address || property?.address,
      check_in: hold.check_in,
      check_out: hold.check_out,
      guest_count: hold.guest_count,
      guest_first_name: hold.guest_first_name,
      guest_last_name: hold.guest_last_name,
      total_price: hold.total_price,
      price_breakdown: hold.price_breakdown,
      status: hold.status,
      expires_at: hold.expires_at,
      policy: policy,
    },
    clientSecret,
  };

  return NextResponse.json(response);
}

async function createPaymentIntent(hold: any, stripeAccountId: string) {
  return await stripe.paymentIntents.create(
    {
      amount: hold.total_price,
      currency: 'usd',
      metadata: {
        hold_id: hold.id,
        property_id: hold.property_id,
        workspace_id: hold.workspace_id,
        check_in: hold.check_in,
        check_out: hold.check_out,
      },
      payment_method_types: ['card'],
    },
    {
      stripeAccount: stripeAccountId,
    }
  );
}
