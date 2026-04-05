import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id: policyId } = await params;
  
  const { data, error } = await supabase
    .from('booking_policies')
    .select('*')
    .eq('id', policyId)
    .single();
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const body = await request.json();
  const { id: policyId } = await params;
  
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

  // If setting as default, unset other defaults first
  if (body.is_default) {
    await supabase
      .from('booking_policies')
      .update({ is_default: false })
      .eq('workspace_id', membership.workspace_id)
      .neq('id', policyId);
  }

  const { data, error } = await supabase
    .from('booking_policies')
    .update({
      name: body.name,
      payment_policy: body.payment_policy,
      cancellation_policy: body.cancellation_policy,
      quote_expiry_hours: body.quote_expiry_hours || 48,
      is_default: body.is_default || false,
      rental_agreement_text: body.rental_agreement_text || null,
    })
    .eq('id', policyId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id: policyId } = await params;
  
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

  // Soft delete
  const { error } = await supabase
    .from('booking_policies')
    .update({ is_active: false })
    .eq('id', policyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
