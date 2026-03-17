import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const serviceRoleClient = createCohostServiceClient();
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get booking
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, workspace_id, status, source')
      .eq('id', id)
      .single();
    
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    
    // Only direct bookings can be cancelled this way
    if (booking.source !== 'direct') {
      return NextResponse.json({ 
        error: 'Only direct bookings can be cancelled here. iCal bookings are managed by the source platform.' 
      }, { status: 400 });
    }
    
    // Verify access
    const { data: membership } = await supabase
      .from('cohost_workspace_members')
      .select('role')
      .eq('workspace_id', booking.workspace_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    
    if (booking.status === 'cancelled') {
      return NextResponse.json({ error: 'Booking already cancelled' }, { status: 400 });
    }
    
    // Cancel booking (Preserve row for audit, just update status)
    const { error: updateError } = await serviceRoleClient
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', id);
    
    if (updateError) {
      return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('Cancel booking error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
