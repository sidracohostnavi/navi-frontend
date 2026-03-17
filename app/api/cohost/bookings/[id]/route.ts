import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get booking with audit fields
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        id,
        workspace_id,
        property_id,
        guest_name,
        guest_email,
        guest_phone,
        check_in,
        check_out,
        source,
        status,
        total_price,
        stripe_payment_intent_id,
        payment_link_token,
        rental_agreement_accepted_at,
        cancelled_at,
        refund_amount,
        notes,
        created_at,
        created_by_user_id,
        guest_count
      `)
      .eq('id', id)
      .single();
    
    if (error || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    
    // Verify access
    const { data: membership } = await supabase
      .from('cohost_workspace_members')
      .select('role')
      .eq('workspace_id', booking.workspace_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Get property name
    const { data: property } = await supabase
      .from('cohost_properties')
      .select('name')
      .eq('id', booking.property_id)
      .single();
    
    return NextResponse.json({
      booking: {
        ...booking,
        propertyName: property?.name,
      },
    });
    
  } catch (error: any) {
    console.error('Get booking error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
