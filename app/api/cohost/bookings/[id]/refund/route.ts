import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { stripe } from '@/lib/services/stripe-service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const serviceRoleClient = createCohostServiceClient();
    const { amount } = await request.json(); // amount in cents, or null for full refund
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get booking
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, workspace_id, source, total_price, stripe_payment_intent_id, refund_amount')
      .eq('id', id)
      .single();
    
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    
    if (booking.source !== 'direct') {
      return NextResponse.json({ error: 'Only direct bookings can be refunded here' }, { status: 400 });
    }
    
    if (!booking.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'No payment to refund' }, { status: 400 });
    }
    
    // Verify access
    const { data: membership } = await supabase
      .from('cohost_workspace_members')
      .select('role')
      .eq('workspace_id', booking.workspace_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    
    // Calculate refund amount
    const alreadyRefunded = booking.refund_amount || 0;
    const maxRefund = booking.total_price - alreadyRefunded;
    const refundAmount = amount ? Math.min(amount, maxRefund) : maxRefund;
    
    if (refundAmount <= 0) {
      return NextResponse.json({ error: 'Nothing left to refund' }, { status: 400 });
    }
    
    // Process refund via Stripe
    try {
      await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
        amount: refundAmount,
      });
    } catch (stripeError: any) {
      console.error('Stripe refund error:', stripeError);
      return NextResponse.json({ error: stripeError.message }, { status: 500 });
    }
    
    // Update booking refund amount (using service role)
    const newRefundTotal = (booking.refund_amount || 0) + refundAmount;
    const { error: updateError } = await serviceRoleClient
      .from('bookings')
      .update({ 
        refund_amount: newRefundTotal
      })
      .eq('id', id);
    
    if (updateError) {
      console.error('Failed to update refund amount:', updateError);
    }
    
    return NextResponse.json({
      success: true,
      refunded: refundAmount,
      totalRefunded: newRefundTotal,
    });
    
  } catch (error: any) {
    console.error('Refund error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
