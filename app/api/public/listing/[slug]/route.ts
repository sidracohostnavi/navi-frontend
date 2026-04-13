import { NextRequest, NextResponse } from 'next/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = createCohostServiceClient();
    const { slug } = await params;
    const isPreview = request.nextUrl.searchParams.get('preview') === 'true';

    // Preview mode: verify the requester is an authenticated workspace member
    if (isPreview) {
      const supabaseAuth = await createClient();
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // Verify membership — fetch property workspace and check membership
      const { data: prop } = await supabase
        .from('cohost_properties')
        .select('workspace_id')
        .eq('slug', slug)
        .maybeSingle();
      if (prop) {
        const { data: membership } = await supabase
          .from('cohost_workspace_members')
          .select('role')
          .eq('workspace_id', prop.workspace_id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (!membership) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
      }
    }

    // Get listing — skip direct_booking_enabled check in preview mode
    const selectFields = `
        id,
        workspace_id,
        name,
        headline,
        description,
        your_property,
        guest_access,
        interaction_with_guests,
        other_details,
        listing_photos,
        image_url,
        nightly_rate,
        cleaning_fee,
        min_nights,
        max_nights,
        max_guests,
        base_guests_included,
        extra_guest_fee,
        extra_guest_fee_frequency,
        additional_fees,
        taxes,
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
        street_address,
        rental_agreement_text,
        policy:booking_policies(
          name,
          payment_policy,
          cancellation_policy,
          rental_agreement_text,
          quote_expiry_hours
        )
      `;
    let baseQuery = supabase.from('cohost_properties').select(selectFields).eq('slug', slug).not('slug', 'is', null);
    if (!isPreview) baseQuery = baseQuery.eq('direct_booking_enabled', true);
    let { data: property, error } = await baseQuery.maybeSingle();

    // FALLBACK: If policy join fails, retry without it
    if (error && (error.message.includes('policy') || error.message.includes('column'))) {
      const retry = await supabase
        .from('cohost_properties')
        .select(`
          id, workspace_id, name, headline, description, your_property, guest_access,
          interaction_with_guests, other_details, listing_photos, image_url,
          nightly_rate, cleaning_fee, min_nights, max_nights, max_guests,
          base_guests_included, extra_guest_fee, extra_guest_fee_frequency,
          additional_fees, taxes, bedrooms, beds, bathrooms, amenities, house_rules,
          check_in_time, check_out_time, city, state, country, street_address,
          rental_agreement_text
        `)
        .eq('slug', slug)
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

    // Get workspace name for white-label header
    let workspaceName = '';
    if (property.workspace_id) {
      const { data: ws } = await supabase
        .from('cohost_workspaces')
        .select('name')
        .eq('id', property.workspace_id)
        .maybeSingle();
      workspaceName = ws?.name || '';
    }

    // Normalize listing_photos — handle both legacy string[] and new {url,caption,space}[] formats
    const rawPhotos: any[] = property.listing_photos || [];
    const photos = rawPhotos.map((p: any) =>
      typeof p === 'string'
        ? { url: p, caption: '', space: 'General' }
        : { url: p.url || '', caption: p.caption || '', space: p.space || 'General' }
    ).filter((p: any) => !!p.url);

    // Derive unique spaces in order they first appear
    const spacesOrdered: string[] = [];
    for (const p of photos) {
      if (p.space && !spacesOrdered.includes(p.space)) spacesOrdered.push(p.space);
    }

    // Format for public consumption
    const listing = {
      name: property.name,
      headline: property.headline,
      description: property.description,
      yourProperty: property.your_property || '',
      guestAccess: property.guest_access || '',
      interactionWithGuests: property.interaction_with_guests || '',
      otherDetails: property.other_details || '',
      photos,
      spaces: spacesOrdered,
      coverPhoto: photos[0]?.url || property.image_url || '',
      nightlyRate: property.nightly_rate,
      cleaningFee: property.cleaning_fee || 0,
      minNights: property.min_nights || 1,
      maxNights: property.max_nights || 30,
      maxGuests: property.max_guests,
      baseGuestsIncluded: property.base_guests_included || 2,
      extraGuestFee: property.extra_guest_fee || 0,
      extraGuestFeeFrequency: property.extra_guest_fee_frequency || 'night',
      additionalFees: property.additional_fees || [],
      taxes: property.taxes || [],
      bedrooms: property.bedrooms,
      beds: property.beds,
      bathrooms: property.bathrooms,
      amenities: property.amenities || [],
      houseRules: property.house_rules,
      checkInTime: property.check_in_time,
      checkOutTime: property.check_out_time,
      location: [property.city, property.state, property.country].filter(Boolean).join(', '),
      address: [property.street_address, property.city, property.state, property.country].filter(Boolean).join(', '),
      rentalAgreementText: property.rental_agreement_text || '',
      policy: property.policy as any,
      workspaceName,
    };

    return NextResponse.json({ listing, propertyId: property.id });

  } catch (error: any) {
    console.error('Get public listing error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
