import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  
  // Get user's workspace
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { data: membership } = await supabase
    .from('cohost_workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single();
    
  if (!membership) return NextResponse.json({ error: 'No workspace' }, { status: 400 });
  
  const { data, error } = await supabase
    .from('workspace_fees')
    .select('*')
    .eq('workspace_id', membership.workspace_id)
    .eq('is_active', true)
    .order('display_order');
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json();
  
  // Get user's workspace
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
  
  const { data, error } = await supabase
    .from('workspace_fees')
    .insert({
      workspace_id: membership.workspace_id,
      name: body.name,
      amount: body.amount,
      percentage: body.percentage,
      fee_type: body.fee_type,
      is_tax: body.is_tax || false,
      is_required: body.is_required ?? true,
      applies_to_property_ids: body.applies_to_property_ids,
      display_order: body.display_order || 0,
    })
    .select()
    .single();
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
