import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendPaymentLinkEmail } from '@/lib/services/email-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get booking
    const { data: booking } = await supabase
      .from('bookings')
      .select(`
        id,
        guest_name,
        guest_email,
        payment_link_token,
        total_price,
        check_in,
        check_out,
        status,
        workspace_id,
        property_id
      `)
      .eq('id', id)
      .single();
    
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    
    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from('cohost_workspace_members')
      .select('role')
      .eq('workspace_id', booking.workspace_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    if (booking.status !== 'pending_payment') {
      return NextResponse.json({ error: 'Booking is not pending payment' }, { status: 400 });
    }
    
    if (!booking.guest_email) {
      return NextResponse.json({ error: 'No guest email' }, { status: 400 });
    }
    
    const paymentUrl = `${process.env.NEXT_PUBLIC_APP_URL}/pay/${booking.payment_link_token}`;
    
    // Send email (Side effect)
    (async () => {
      try {
        const { data: property } = await supabase
          .from('cohost_properties')
          .select('name')
          .eq('id', booking.property_id)
          .single();

        const nights = Math.ceil(
          (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) 
          / (1000 * 60 * 60 * 24)
        );

        await sendPaymentLinkEmail({
          guestName: booking.guest_name,
          guestEmail: booking.guest_email,
          propertyName: property?.name || 'Property',
          checkIn: booking.check_in,
          checkOut: booking.check_out,
          totalPrice: booking.total_price,
          nights,
          paymentUrl,
        });
      } catch (err) {
        console.error('Failed to send payment link email:', err);
      }
    })();
    
    return NextResponse.json({
      sent: true,
      paymentUrl,
    });
    
  } catch (error: any) {
    console.error('Send payment link error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
