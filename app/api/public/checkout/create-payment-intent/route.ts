import { NextRequest, NextResponse } from 'next/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { stripe } from '@/lib/services/stripe-service';

export async function POST(request: NextRequest) {
  try {
    const supabase = createCohostServiceClient();
    const { 
      sessionId, 
      propertyId,
      checkIn,
      checkOut,
      guestName,
      guestEmail,
      guestPhone,
      guestCount,
      totalPrice,
      bookingId,
    } = await request.json();
    
    // Verify hold exists and is not expired (Skip if it's a host-initiated booking with bookingId)
    if (!bookingId) {
        const { data: hold } = await supabase
          .from('booking_holds')
          .select('id, expires_at')
          .eq('session_id', sessionId)
          .eq('property_id', propertyId)
          .single();
        
        if (!hold) {
          return NextResponse.json({ error: 'Session expired. Please start over.' }, { status: 400 });
        }
        
        if (new Date(hold.expires_at) < new Date()) {
          return NextResponse.json({ error: 'Session expired. Please start over.' }, { status: 400 });
        }
    }
    
    // Get workspace Stripe account
    const { data: property } = await supabase
      .from('cohost_properties')
      .select('workspace_id, name')
      .eq('id', propertyId)
      .single();
    
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }
    
    const { data: workspace } = await supabase
      .from('cohost_workspaces')
      .select('stripe_account_id')
      .eq('id', property.workspace_id)
      .single();
    
    if (!workspace?.stripe_account_id) {
      return NextResponse.json({ error: 'Payment not configured' }, { status: 400 });
    }
    
    // Create PaymentIntent on connected account
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalPrice,
      currency: 'usd',
      metadata: {
        sessionId,
        propertyId,
        workspaceId: property.workspace_id,
        checkIn,
        checkOut,
        guestName,
        guestEmail,
        guestPhone,
        guestCount: String(guestCount),
        bookingId: bookingId || '',
      },
      // Payment goes directly to the host's connected account
      transfer_data: {
        destination: workspace.stripe_account_id,
      },
      // You can add an application fee here in the future:
      // application_fee_amount: Math.round(totalPrice * 0.03), // 3% fee
    });
    
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
    
  } catch (error: any) {
    console.error('Create payment intent error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
