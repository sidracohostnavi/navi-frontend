import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { 
  sendGuestConfirmationEmail, 
  sendHostNotificationEmail 
} from '@/lib/services/email-service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Handle the event
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    await handlePaymentSuccess(paymentIntent);
  }

  return NextResponse.json({ received: true });
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const holdId = paymentIntent.metadata.hold_id;
  
  if (!holdId) {
    console.log('No hold_id in payment metadata, skipping custom hold conversion');
    return;
  }

  const supabase = createCohostServiceClient();

  // Get hold
  const { data: hold, error: holdError } = await supabase
    .from('booking_holds')
    .select(`
      *,
      cohost_properties (name, workspace_id),
      cohost_workspaces (owner_id)
    `)
    .eq('id', holdId)
    .single();

  if (holdError || !hold) {
    console.error('Hold not found in webhook:', holdId, holdError);
    return;
  }

  // Check if already converted
  if (hold.status === 'converted') {
    console.log('Hold already converted:', holdId);
    return;
  }

  // Create booking
  const guestName = `${hold.guest_first_name || ''} ${hold.guest_last_name || ''}`.trim() || 'Guest';

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      workspace_id: hold.workspace_id,
      property_id: hold.property_id,
      check_in: hold.check_in,
      check_out: hold.check_out,
      guest_name: guestName,
      guest_count: hold.guest_count,
      guest_email: hold.guest_email,
      guest_phone: hold.guest_phone,
      total_price: hold.total_price,
      status: 'confirmed',
      source: 'direct',
      source_type: 'direct',
      platform: 'Direct Booking',
      stripe_payment_intent_id: paymentIntent.id,
      created_by_user_id: hold.created_by_user_id,
      notes: hold.notes,
      is_active: true,
      rental_agreement_accepted_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (bookingError) {
    console.error('Failed to create booking in webhook:', bookingError);
    return;
  }

  // Update hold status
  await supabase
    .from('booking_holds')
    .update({
      status: 'converted',
      converted_booking_id: booking.id,
    })
    .eq('id', holdId);

  console.log('Hold converted to booking:', holdId, '->', booking.id);

  // Send confirmation emails
  try {
    const nights = Math.max(1, Math.ceil(
      (new Date(hold.check_out).getTime() - new Date(hold.check_in).getTime()) 
      / (1000 * 60 * 60 * 24)
    ));

    // Get host email
    let hostEmail: string | undefined;
    if (hold.cohost_workspaces?.owner_id) {
        const { data: owner } = await supabase.auth.admin.getUserById(hold.cohost_workspaces.owner_id);
        hostEmail = owner?.user?.email;
    }

    if (hold.guest_email) {
      await sendGuestConfirmationEmail({
        guestName,
        guestEmail: hold.guest_email,
        propertyName: hold.cohost_properties?.name || 'Property',
        checkIn: hold.check_in,
        checkOut: hold.check_out,
        totalPrice: hold.total_price,
        nights,
      });
    }

    if (hostEmail) {
      await sendHostNotificationEmail({
        hostEmail,
        guestName,
        guestEmail: hold.guest_email || 'No email provided',
        guestPhone: hold.guest_phone || undefined,
        propertyName: hold.cohost_properties?.name || 'Property',
        checkIn: hold.check_in,
        checkOut: hold.check_out,
        totalPrice: hold.total_price,
        nights,
      });
    }
  } catch (e) {
    console.error('Failed to send confirmation emails in webhook:', e);
  }
}
