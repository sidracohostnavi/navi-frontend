import { createClient } from '@/lib/supabase/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { NextResponse, NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  
  const { data, error } = await supabase
    .from('cohost_properties')
    .select('id, name, base_nightly_rate, currency, min_nights, max_guests, base_guests_included, extra_guest_fee')
    .eq('id', id)
    .single();
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabaseAuth = await createClient();
  const { id } = await params;
  const body = await request.json();
  
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabaseService = createCohostServiceClient();

  // Verify access
  const { data: property } = await supabaseService.from('cohost_properties').select('workspace_id').eq('id', id).single();
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: membership } = await supabaseService.from('cohost_workspace_members').select('role').eq('workspace_id', property.workspace_id).eq('user_id', user.id).single();
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updatePayload: Record<string, any> = {};
  if (body.base_nightly_rate !== undefined) updatePayload.base_nightly_rate = body.base_nightly_rate;
  if (body.currency !== undefined) updatePayload.currency = body.currency;
  if (body.min_nights !== undefined) updatePayload.min_nights = body.min_nights;
  if (body.max_guests !== undefined) updatePayload.max_guests = body.max_guests;
  if (body.base_guests_included !== undefined) updatePayload.base_guests_included = body.base_guests_included;
  if (body.extra_guest_fee !== undefined) updatePayload.extra_guest_fee = body.extra_guest_fee;

  const { data, error } = await supabaseService
    .from('cohost_properties')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
