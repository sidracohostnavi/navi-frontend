import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

// PATCH: host marks cleaning payment status (pending_payment ↔ paid)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createCohostServiceClient();

  // Only owner/admin can update payment status
  const { data: member } = await service
    .from('cohost_workspace_members')
    .select('role, is_active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!member?.is_active || !['owner', 'admin', 'manager'].includes(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { payment_status } = body;

  if (!['pending_payment', 'paid'].includes(payment_status)) {
    return NextResponse.json({ error: 'Invalid payment_status' }, { status: 400 });
  }

  // Verify the cleaning_completion belongs to this workspace
  const { data: completion } = await service
    .from('cleaning_completions')
    .select('id, workspace_id')
    .eq('booking_id', bookingId)
    .single();

  if (!completion || completion.workspace_id !== workspaceId) {
    return NextResponse.json({ error: 'Cleaning record not found' }, { status: 404 });
  }

  const updateFields: Record<string, any> = { payment_status };
  if (payment_status === 'paid') {
    updateFields.paid_at = new Date().toISOString();
    updateFields.paid_by_user_id = user.id;
  } else {
    // Reverting to pending: clear paid fields
    updateFields.paid_at = null;
    updateFields.paid_by_user_id = null;
  }

  const { error } = await service
    .from('cleaning_completions')
    .update(updateFields)
    .eq('booking_id', bookingId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
