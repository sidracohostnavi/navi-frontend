import { NextRequest, NextResponse } from 'next/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { createClient } from '@/lib/supabase/server';
import { isValidSlug } from '@/lib/utils/slug';

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
    const { data: property, error } = await supabase
      .from('cohost_properties')
      .select(`
        id,
        name,
        direct_booking_enabled,
        slug,
        headline,
        description,
        listing_photos,
        rental_agreement_text,
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
        workspace_id
      `)
      .eq('id', propertyId)
      .single();
    
    if (error || !property) {
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
      const requiredFields = ['headline', 'description', 'nightly_rate', 'rental_agreement_text', 'slug'];
      const missing = requiredFields.filter(f => !body[f]);
      if (missing.length > 0) {
        const readableMissing = missing.map(f => f === 'rental_agreement_text' ? 'rental agreement' : f === 'nightly_rate' ? 'nightly_rate' : f).join(', ');
        return NextResponse.json({ 
          error: `Please fill in required fields: ${readableMissing}` 
        }, { status: 400 });
      }
    }
    
    // Prepare update object (only allowed fields)
    const update: Record<string, any> = {};
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
    ];
    
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        update[field] = body[field];
      }
    }
    
    // Update property
    const { error: updateError } = await supabase
      .from('cohost_properties')
      .update(update)
      .eq('id', propertyId);
    
    if (updateError) {
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('Update listing error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
