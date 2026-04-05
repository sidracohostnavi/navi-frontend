import { createClient } from '@/lib/supabase/server';
import { NextResponse, NextRequest } from 'next/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await request.json();
  
  const { data, error } = await supabase
    .from('workspace_fees')
    .update({
      name: body.name,
      amount: body.amount,
      percentage: body.percentage,
      fee_type: body.fee_type,
      is_tax: body.is_tax,
      is_required: body.is_required,
      applies_to_property_ids: body.applies_to_property_ids,
      display_order: body.display_order,
    })
    .eq('id', id)
    .select()
    .single();
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  
  // Soft delete
  const { error } = await supabase
    .from('workspace_fees')
    .update({ is_active: false })
    .eq('id', id);
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
