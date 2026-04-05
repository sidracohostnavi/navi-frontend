import { NextRequest, NextResponse } from 'next/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = createCohostServiceClient();
    
    // Get booking by payment link token
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        id,
        guest_name,
        guest_email,
        check_in,
        check_out,
        total_price,
        status,
        property_id,
        workspace_id,
        guest_count
      `)
      .eq('payment_link_token', token)
      .single();
    
    if (error || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    
    // Token is only valid if booking status is pending_payment
    // This handles the "invalidate after payment" rule automatically
    if (booking.status !== 'pending_payment') {
      return NextResponse.json({ 
        error: 'This payment link has already been used or is no longer valid.',
        status: booking.status,
      }, { status: 400 });
    }
    
    // Get property details
    const { data: property } = await supabase
      .from('cohost_properties')
      .select('name, rental_agreement_text, check_in_time, check_out_time')
      .eq('id', booking.property_id)
      .single();
    
    const nights = Math.ceil(
      (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    return NextResponse.json({
      booking: {
        id: booking.id,
        guestName: booking.guest_name,
        guestEmail: booking.guest_email,
        checkIn: booking.check_in,
        checkOut: booking.check_out,
        nights,
        totalPrice: booking.total_price,
        guestCount: booking.guest_count,
      },
      property: {
        name: property?.name || 'Your Stay',
        rentalAgreement: property?.rental_agreement_text,
        checkInTime: property?.check_in_time,
        checkOutTime: property?.check_out_time,
      },
      workspaceId: booking.workspace_id,
      propertyId: booking.property_id,
    });
    
  } catch (error: any) {
    console.error('Get payment booking error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
