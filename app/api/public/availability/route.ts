import { NextRequest, NextResponse } from 'next/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = createCohostServiceClient();
    const { propertyId, checkIn, checkOut } = await request.json();
    
    if (!propertyId || !checkIn || !checkOut) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    
    // Validate dates
    if (checkInDate >= checkOutDate) {
      return NextResponse.json({ error: 'Check-out must be after check-in' }, { status: 400 });
    }
    
    // Normalize today's date to midnight for comparison to allow same-day booking
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkInMidnight = new Date(checkInDate);
    checkInMidnight.setHours(0, 0, 0, 0);

    if (checkInMidnight < today) {
      return NextResponse.json({ error: 'Check-in cannot be in the past' }, { status: 400 });
    }
    
    // Check for overlapping bookings
    // A booking overlaps if: existing.check_in < requested.check_out AND existing.check_out > requested.check_in
    const { data: conflicts, error: bookingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .eq('status', 'confirmed')
      .lt('check_in', checkOut)
      .gt('check_out', checkIn)
      .limit(1);
    
    if (bookingError) {
      console.error('Booking check error:', bookingError);
      return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 });
    }
    
    // Check for overlapping holds
    // Ignore released, converted, or expired holds
    const { data: holds, error: holdError } = await supabase
      .from('booking_holds')
      .select('id')
      .eq('property_id', propertyId)
      .is('released_at', null)
      .is('converted_booking_id', null)
      .gt('expires_at', new Date().toISOString())
      .lt('check_in', checkOut)
      .gt('check_out', checkIn)
      .limit(1);
    
    if (holdError) {
      console.error('Hold check error:', holdError);
      // Don't fail the request, just log
    }
    
    const isAvailable = (!conflicts || conflicts.length === 0) && (!holds || holds.length === 0);
    
    return NextResponse.json({ available: isAvailable });
    
  } catch (error: any) {
    console.error('Availability check error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
