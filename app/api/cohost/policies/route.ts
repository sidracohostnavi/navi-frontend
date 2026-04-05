import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { data: membership } = await supabase
    .from('cohost_workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single();
    
  if (!membership) return NextResponse.json({ error: 'No workspace' }, { status: 400 });
  
  const { data, error } = await supabase
    .from('booking_policies')
    .select('*')
    .eq('workspace_id', membership.workspace_id)
    .eq('is_active', true)
    .order('name');
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

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
    
  if (!membership || !['owner', 'manager', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // If setting as default, unset other defaults
  if (body.is_default) {
    await supabase
      .from('booking_policies')
      .update({ is_default: false })
      .eq('workspace_id', membership.workspace_id);
  }

  const { data, error } = await supabase
    .from('booking_policies')
    .insert({
      workspace_id: membership.workspace_id,
      name: body.name,
      payment_policy: body.payment_policy,
      cancellation_policy: body.cancellation_policy,
      quote_expiry_hours: body.quote_expiry_hours || 48,
      is_default: body.is_default || false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
