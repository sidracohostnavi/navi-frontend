import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> } // Next.js 15+ fix
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

  // Get booking
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

  // Check if booking can be cancelled
  if (booking.source !== 'direct') {
    return NextResponse.json({ 
      error: 'Only direct bookings can be cancelled here. iCal bookings must be cancelled on their original platform.' 
    }, { status: 400 });
  }

  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'Booking is already cancelled' }, { status: 400 });
  }

  // Handle refund if requested
  const refundAmount = body.refundAmount || 0; // in cents
  let refundId = null;

  if (refundAmount > 0 && booking.stripe_payment_intent_id) {
    try {
      // Get workspace's Stripe account
      const { data: workspace } = await supabase
        .from('cohost_workspaces')
        .select('stripe_account_id')
        .eq('id', membership.workspace_id)
        .single();

      if (workspace?.stripe_account_id) {
        const refund = await stripe.refunds.create(
          {
            payment_intent: booking.stripe_payment_intent_id,
            amount: refundAmount,
          },
          {
            stripeAccount: workspace.stripe_account_id,
          }
        );
        refundId = refund.id;
        console.log(`[Cancel] Refund created: ${refundId} for ${refundAmount} cents`);
      }
    } catch (e: any) {
      console.error('[Cancel] Refund failed:', e.message);
      return NextResponse.json({ error: `Refund failed: ${e.message}` }, { status: 400 });
    }
  }

  // Update booking
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      refund_amount: refundAmount,
      is_active: false, // Free up the dates
    })
    .eq('id', bookingId);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 });
  }

  console.log(`[Cancel] Booking ${bookingId} cancelled. Refund: ${refundAmount} cents`);

  return NextResponse.json({ 
    success: true, 
    refundId,
    refundAmount,
  });
}
