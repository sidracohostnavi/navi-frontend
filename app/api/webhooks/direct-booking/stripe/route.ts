import { NextRequest, NextResponse } from 'next/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { stripe } from '@/lib/services/stripe-service';
import { createDirectBooking, deleteHold } from '@/lib/services/booking-service';
import { 
  sendGuestConfirmationEmail, 
  sendHostNotificationEmail 
} from '@/lib/services/email-service';

export const dynamic = 'force-dynamic';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }
    
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET is not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: `Invalid signature: ${err.message}` }, { status: 400 });
    }
    
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as any;
      const metadata = paymentIntent.metadata;
      
      console.log('Payment intent succeeded:', paymentIntent.id);
      
      const supabase = createCohostServiceClient();

      // CASE 1: Host-initiated payment link (Existing booking needs upgrade)
      if (metadata.bookingId) {
        console.log('Confirmed payment link for booking:', metadata.bookingId);
        const { error: updateError } = await supabase
            .from('bookings')
            .update({
                status: 'confirmed',
                stripe_payment_intent_id: paymentIntent.id,
                rental_agreement_accepted_at: new Date().toISOString(),
            })
            .eq('id', metadata.bookingId)
            .eq('status', 'pending_payment'); // Safety check
        
        if (updateError) {
            console.error('Failed to confirm host booking:', updateError);
        } else {
            // Send emails as side effect
            (async () => {
                try {
                    const { data: booking } = await supabase
                        .from('bookings')
                        .select('*, property:cohost_properties(name), workspace:cohost_workspaces(owner_id)')
                        .eq('id', metadata.bookingId)
                        .single();
                    
                    if (booking) {
                        const nights = Math.ceil(
                            (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) 
                            / (1000 * 60 * 60 * 24)
                        );

                        let hostEmail = null;
                        if (booking.workspace?.owner_id) {
                            const { data: owner } = await supabase.auth.admin.getUserById(booking.workspace.owner_id);
                            hostEmail = owner?.user?.email;
                        }

                        await sendGuestConfirmationEmail({
                            guestName: booking.guest_name,
                            guestEmail: booking.guest_email,
                            propertyName: booking.property?.name || 'Your booking',
                            checkIn: booking.check_in,
                            checkOut: booking.check_out,
                            totalPrice: paymentIntent.amount,
                            nights,
                        });

                        if (hostEmail) {
                            await sendHostNotificationEmail({
                                hostEmail,
                                guestName: booking.guest_name,
                                guestEmail: booking.guest_email,
                                guestPhone: booking.guest_phone,
                                propertyName: booking.property?.name || 'Property',
                                checkIn: booking.check_in,
                                checkOut: booking.check_out,
                                totalPrice: paymentIntent.amount,
                                nights,
                            });
                        }
                    }
                } catch (emailErr) {
                    console.error('Post-payment email error (Case 1):', emailErr);
                }
            })();
        }
        return NextResponse.json({ received: true });
      }

      // CASE 2: Guest-initiated checkout (New booking needs creation)
      
      // Idempotency: Check if booking already exists
      const { data: existing } = await supabase
        .from('bookings')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntent.id)
        .maybeSingle();
      
      if (existing) {
        console.log('Booking already exists for payment:', paymentIntent.id);
        return NextResponse.json({ received: true });
      }
      
      // Create booking
      try {
        await createDirectBooking(supabase, {
          propertyId: metadata.propertyId,
          workspaceId: metadata.workspaceId,
          checkIn: metadata.checkIn,
          checkOut: metadata.checkOut,
          guestName: metadata.guestName,
          guestEmail: metadata.guestEmail,
          guestPhone: metadata.guestPhone,
          guestCount: parseInt(metadata.guestCount) || 1,
          totalPrice: paymentIntent.amount,
          stripePaymentIntentId: paymentIntent.id,
        });
        
        // Delete hold
        if (metadata.sessionId) {
          await deleteHold(supabase, metadata.sessionId);
        }
        
        console.log('Direct booking created successfully for PI:', paymentIntent.id);
        
        // Send confirmation emails (Side effect)
        (async () => {
            try {
                const nights = Math.ceil(
                    (new Date(metadata.checkOut).getTime() - new Date(metadata.checkIn).getTime()) 
                    / (1000 * 60 * 60 * 24)
                );

                const { data: property } = await supabase
                    .from('cohost_properties')
                    .select('name')
                    .eq('id', metadata.propertyId)
                    .single();

                const { data: workspace } = await supabase
                    .from('cohost_workspaces')
                    .select('owner_id')
                    .eq('id', metadata.workspaceId)
                    .single();

                let hostEmail = null;
                if (workspace?.owner_id) {
                    const { data: owner } = await supabase.auth.admin.getUserById(workspace.owner_id);
                    hostEmail = owner?.user?.email;
                }

                await sendGuestConfirmationEmail({
                    guestName: metadata.guestName,
                    guestEmail: metadata.guestEmail,
                    propertyName: property?.name || 'Your booking',
                    checkIn: metadata.checkIn,
                    checkOut: metadata.checkOut,
                    totalPrice: paymentIntent.amount,
                    nights,
                });

                if (hostEmail) {
                    await sendHostNotificationEmail({
                        hostEmail,
                        guestName: metadata.guestName,
                        guestEmail: metadata.guestEmail,
                        guestPhone: metadata.guestPhone,
                        propertyName: property?.name || 'Property',
                        checkIn: metadata.checkIn,
                        checkOut: metadata.checkOut,
                        totalPrice: paymentIntent.amount,
                        nights,
                    });
                }
            } catch (emailErr) {
                console.error('Post-payment email error (Case 2):', emailErr);
            }
        })();
        
      } catch (err: any) {
        console.error('Failed to create booking in webhook:', err);
      }
    }
    
    return NextResponse.json({ received: true });
    
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
