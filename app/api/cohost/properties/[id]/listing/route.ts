import { NextRequest, NextResponse } from 'next/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { createClient } from '@/lib/supabase/server';
import { isValidSlug } from '@/lib/utils/slug';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseAuth = await createClient();
    const { id: propertyId } = await params;
    
    // Get current user and verify access
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const supabase = createCohostServiceClient();
    
    // Get property with workspace check
    let { data: property, error } = await supabase
      .from('cohost_properties')
      .select(`
        id, name, direct_booking_enabled, slug, headline, description,
        listing_photos, rental_agreement_text, nightly_rate, cleaning_fee,
        min_nights, max_nights, base_nightly_rate, currency, policy_id,
        base_guests_included, extra_guest_fee, extra_guest_fee_frequency, additional_fees, taxes, workspace_id,
        advance_notice_days, allow_last_minute_requests, same_day_advance_notice_time,
        preparation_time_days, availability_window_months, allow_request_beyond_window, is_unavailable_by_default,
        max_guests,
        policy:booking_policies(*)
      `)
      .eq('id', propertyId)
      .maybeSingle();
    
    // FALLBACK: If columns are missing, retry with basic fields
    if (error && (error.message.includes('column') || error.message.includes('policy'))) {
      const { data: retryData, error: retryError } = await supabase
        .from('cohost_properties')
        .select(`
          id, name, direct_booking_enabled, slug, headline, description, 
          listing_photos, rental_agreement_text, nightly_rate, cleaning_fee, 
          min_nights, base_nightly_rate, currency, workspace_id
        `)
        .eq('id', propertyId)
        .maybeSingle();
      
      if (retryData) {
        property = { 
          id: retryData.id,
          name: retryData.name,
          direct_booking_enabled: retryData.direct_booking_enabled,
          slug: retryData.slug,
          headline: retryData.headline,
          description: retryData.description,
          listing_photos: retryData.listing_photos,
          rental_agreement_text: retryData.rental_agreement_text,
          nightly_rate: retryData.nightly_rate,
          cleaning_fee: retryData.cleaning_fee,
          min_nights: retryData.min_nights,
          base_nightly_rate: retryData.base_nightly_rate,
          currency: retryData.currency,
          workspace_id: retryData.workspace_id,
          max_nights: 30, 
          additional_fees: [], 
          taxes: [],
          base_guests_included: 2,
          extra_guest_fee: 0,
          extra_guest_fee_frequency: 'nightly',
          policy: null,
          policy_id: null
        } as any;
        error = null;
      }
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }
    
    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from('cohost_workspace_members')
      .select('role')
      .eq('workspace_id', property.workspace_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Get workspace Stripe status, name, and total properties count
    const { data: workspace } = await supabase
      .from('cohost_workspaces')
      .select('name, stripe_account_id, stripe_onboarding_complete')
      .eq('id', property.workspace_id)
      .single();
      
    const { count: workspacePropertyCount } = await supabase
      .from('cohost_properties')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', property.workspace_id);
    
    return NextResponse.json({
      property,
      stripeConnected: workspace?.stripe_onboarding_complete ?? false,
      workspaceName: workspace?.name ?? '',
      workspacePropertyCount: workspacePropertyCount ?? 1
    });
    
  } catch (error: any) {
    console.error('Get listing error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseAuth = await createClient();
    const { id: propertyId } = await params;
    const body = await request.json();
    
    // Get current user
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const supabase = createCohostServiceClient();
    
    // Get property and verify ownership
    const { data: property } = await supabase
      .from('cohost_properties')
      .select('workspace_id, slug')
      .eq('id', propertyId)
      .single();
    
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }
    
    // Verify user has edit access
    const { data: membership } = await supabase
      .from('cohost_workspace_members')
      .select('role')
      .eq('workspace_id', property.workspace_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    
    // Validate slug if provided
    if (body.slug && body.slug !== property.slug) {
      if (!isValidSlug(body.slug)) {
        return NextResponse.json({ 
          error: 'Invalid slug. Use only lowercase letters, numbers, and hyphens.' 
        }, { status: 400 });
      }
      
      // Check slug uniqueness
      const { data: existing } = await supabase
        .from('cohost_properties')
        .select('id')
        .eq('slug', body.slug)
        .neq('id', propertyId)
        .single();
      
      if (existing) {
        return NextResponse.json({ 
          error: 'This URL is already taken. Please choose a different one.' 
        }, { status: 400 });
      }
    }
    
    // If enabling direct booking, validate requirements (enforcing slug too)
    if (body.direct_booking_enabled) {
      if (!user.email_confirmed_at) {
        return NextResponse.json({ 
          error: 'Please verify your email address to publish a direct booking page.' 
        }, { status: 403 });
      }

      const { data: workspace } = await supabase
        .from('cohost_workspaces')
        .select('stripe_onboarding_complete')
        .eq('id', property.workspace_id)
        .single();
      
      if (!workspace?.stripe_onboarding_complete) {
        return NextResponse.json({ 
          error: 'Please connect Stripe before enabling direct booking.' 
        }, { status: 400 });
      }
      
      // Check required fields, including slug
      const requiredFields = ['headline', 'description', 'nightly_rate', 'slug'];
      const missing = requiredFields.filter(f => !body[f]);
      
      // Special check: either rental_agreement_text or policy_id must be present
      if (!body.rental_agreement_text && !body.policy_id) {
        missing.push('rental_agreement_text (or booking policy)');
      }

      if (missing.length > 0) {
        const readableMissing = missing.map(f => f === 'rental_agreement_text' ? 'rental agreement' : f === 'nightly_rate' ? 'nightly_rate' : f).join(', ');
        return NextResponse.json({ 
          error: `Please fill in required fields: ${readableMissing}` 
        }, { status: 400 });
      }
    }
    
    const update: Record<string, any> = {};
    // Allow updating all listing-related fields
    const allowedFields = [
      'direct_booking_enabled',
      'slug',
      'headline',
      'description',
      'listing_photos',
      'rental_agreement_text',
      'nightly_rate',
      'cleaning_fee',
      'min_nights',
      'max_nights',
      'base_nightly_rate',
      'currency',
      'policy_id',
      'base_guests_included',
      'extra_guest_fee',
      'extra_guest_fee_frequency',
      'additional_fees',
      'taxes',
      'advance_notice_days',
      'allow_last_minute_requests',
      'same_day_advance_notice_time',
      'preparation_time_days',
      'availability_window_months',
      'allow_request_beyond_window',
      'is_unavailable_by_default',
    ];
    
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        update[field] = body[field];
      }
    }
    
    // SYNC: If nightly_rate is being updated, sync it to base_nightly_rate
    if (update.nightly_rate !== undefined) {
      update.base_nightly_rate = update.nightly_rate ? update.nightly_rate / 100 : null;
    }
    
    // Update property
    let { error: updateError } = await supabase
      .from('cohost_properties')
      .update(update)
      .eq('id', propertyId);
    
    // FALLBACK: If policy_id is missing from schema, retry without it
    if (updateError && updateError.message.includes('policy_id') && update.policy_id !== undefined) {
      const { policy_id, ...safeUpdate } = update;
      const retry = await supabase
        .from('cohost_properties')
        .update(safeUpdate)
        .eq('id', propertyId);
      
      if (!retry.error) {
        updateError = null;
      }
    }

    if (updateError) {
      return NextResponse.json({ error: updateError.message || 'Failed to save' }, { status: 500 });
    }

    // SYNC: preparation_time_days → cleaning_pre_days + cleaning_post_days
    // Both are kept equal so the calendar blocking matches what the host set in Pricing.
    if (update.preparation_time_days !== undefined) {
      const days = update.preparation_time_days as number;
      await supabase
        .from('cohost_properties')
        .update({ cleaning_pre_days: days, cleaning_post_days: days })
        .eq('id', propertyId);
      // Sync failure is non-fatal — the primary save already succeeded.
    }

    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('Update listing error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
