import { NextRequest, NextResponse } from 'next/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = createCohostServiceClient();
    const { slug } = await params;
    
    // Get published listing
    let { data: property, error } = await supabase
      .from('cohost_properties')
      .select(`
        id,
        name,
        headline,
        description,
        listing_photos,
        nightly_rate,
        cleaning_fee,
        min_nights,
        max_guests,
        bedrooms,
        beds,
        bathrooms,
        amenities,
        house_rules,
        check_in_time,
        check_out_time,
        city,
        state,
        country,
        policy:booking_policies(
          name,
          payment_policy,
          cancellation_policy,
          rental_agreement_text,
          quote_expiry_hours
        )
      `)
      .eq('slug', slug)
      .eq('direct_booking_enabled', true)
      .not('slug', 'is', null)
      .maybeSingle();
    
    // FALLBACK: If policy join fails (usually due to missing policy_id column), retry without it
    if (error && (error.message.includes('policy') || error.message.includes('column'))) {
      const retry = await supabase
        .from('cohost_properties')
        .select(`
          id,
          name,
          headline,
          description,
          listing_photos,
          nightly_rate,
          cleaning_fee,
          min_nights,
          max_guests,
          bedrooms,
          beds,
          bathrooms,
          amenities,
          house_rules,
          check_in_time,
          check_out_time,
          city,
          state,
          country
        `)
        .eq('slug', slug)
        .eq('direct_booking_enabled', true)
        .not('slug', 'is', null)
        .maybeSingle();
      
      if (retry.data) {
        property = { ...retry.data, policy: [] };
        error = null;
      }
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    
    if (!property) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }
    
    // Format for public consumption (hide internal IDs etc)
    const listing = {
      name: property.name,
      headline: property.headline,
      description: property.description,
      photos: property.listing_photos || [],
      nightlyRate: property.nightly_rate,
      cleaningFee: property.cleaning_fee || 0,
      minNights: property.min_nights || 1,
      maxGuests: property.max_guests,
      bedrooms: property.bedrooms,
      beds: property.beds,
      bathrooms: property.bathrooms,
      amenities: property.amenities || [],
      houseRules: property.house_rules,
      checkInTime: property.check_in_time,
      checkOutTime: property.check_out_time,
      location: [property.city, property.state, property.country].filter(Boolean).join(', '),
      policy: property.policy as any,
    };
    
    return NextResponse.json({ listing, propertyId: property.id });
    
  } catch (error: any) {
    console.error('Get public listing error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
