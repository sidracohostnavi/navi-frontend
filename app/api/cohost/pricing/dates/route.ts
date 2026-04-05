import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET: Fetch date-specific pricing for a date range
export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  
  const propertyId = searchParams.get('propertyId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await supabase
    .from('cohost_workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single();

  if (!membership) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

  let query = supabase
    .from('property_date_pricing')
    .select('*')
    .eq('workspace_id', membership.workspace_id);

  if (propertyId) {
    query = query.eq('property_id', propertyId);
  }
  if (startDate) {
    query = query.gte('date', startDate);
  }
  if (endDate) {
    query = query.lte('date', endDate);
  }

  const { data, error } = await query.order('date');

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// POST: Set pricing for date range
export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await supabase
    .from('cohost_workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { propertyId, startDate, endDate, nightlyRate, note } = body;

  if (!propertyId || !startDate || !endDate || nightlyRate === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Generate all dates in range
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  // Nightly rates are set for each night (start to end exclusive)
  while (current < end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  if (dates.length === 0) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
  }

  // Upsert pricing for each date
  const records = dates.map(date => ({
    workspace_id: membership.workspace_id,
    property_id: propertyId,
    date,
    nightly_rate: nightlyRate,
    note: note || null,
    created_by_user_id: user.id,
  }));

  const { data, error } = await supabase
    .from('property_date_pricing')
    .upsert(records, { onConflict: 'property_id,date' })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ updated: data?.length || 0 });
}

// DELETE: Remove date-specific pricing (revert to base rate)
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  
  const propertyId = searchParams.get('propertyId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await supabase
    .from('cohost_workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase
    .from('property_date_pricing')
    .delete()
    .eq('property_id', propertyId)
    .gte('date', startDate)
    .lt('date', endDate);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
