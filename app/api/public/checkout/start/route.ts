import { NextRequest, NextResponse } from 'next/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = createCohostServiceClient();
    const { propertyId, checkIn, checkOut, guests } = await request.json();
    
    if (!propertyId || !checkIn || !checkOut) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Verify property exists and is enabled
    const { data: property, error: propError } = await supabase
      .from('cohost_properties')
      .select('id, workspace_id, slug, rental_agreement_text, nightly_rate, cleaning_fee, min_nights, name')
      .eq('id', propertyId)
      .eq('direct_booking_enabled', true)
      .single();
    
    if (propError || !property) {
      return NextResponse.json({ error: 'Property not available' }, { status: 404 });
    }
    
    // Calculate nights
    const nights = Math.ceil(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (nights < property.min_nights) {
      return NextResponse.json({ 
        error: `Minimum stay is ${property.min_nights} nights` 
      }, { status: 400 });
    }
    
    // Check availability one more time
    const { data: conflicts } = await supabase
      .from('bookings')
      .select('id')
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .neq('status', 'cancelled')
      .lt('check_in', checkOut)
      .gt('check_out', checkIn)
      .limit(1);
    
    if (conflicts && conflicts.length > 0) {
      return NextResponse.json({ error: 'Dates no longer available' }, { status: 409 });
    }
    
    // Create session ID for this checkout using native crypto
    const sessionId = crypto.randomUUID();
    
    // Create hold (expires in 15 minutes)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    
    const { error: holdError } = await supabase
      .from('booking_holds')
      .insert({
        property_id: propertyId,
        check_in: checkIn,
        check_out: checkOut,
        session_id: sessionId,
        expires_at: expiresAt,
      });
    
    if (holdError) {
      console.error('Failed to create hold:', holdError);
      return NextResponse.json({ error: 'Failed to reserve dates' }, { status: 500 });
    }
    
    // Calculate total price
    const nightsTotal = nights * property.nightly_rate;
    const cleaningFee = property.cleaning_fee || 0;
    const totalPrice = nightsTotal + cleaningFee;
    
    return NextResponse.json({
      sessionId,
      expiresAt,
      property: {
        name: property.name,
        slug: property.slug,
      },
      booking: {
        checkIn,
        checkOut,
        nights,
        guests,
      },
      pricing: {
        nightlyRate: property.nightly_rate,
        nightsTotal,
        cleaningFee,
        totalPrice,
      },
      rentalAgreement: property.rental_agreement_text,
      workspaceId: property.workspace_id,
    });
    
  } catch (error: any) {
    console.error('Start checkout error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
