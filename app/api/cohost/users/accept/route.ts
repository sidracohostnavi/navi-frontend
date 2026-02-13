import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await request.json();
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const service = createCohostServiceClient();

  const { data: invite } = await service
    .from('cohost_workspace_invites')
    .select('*')
    .eq('token_hash', tokenHash)
    .eq('status', 'pending')
    .single();

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invite expired' }, { status: 410 });
  }

  if (!user.email || user.email.toLowerCase() !== invite.invitee_email.toLowerCase()) {
    return NextResponse.json({ error: 'Invite email mismatch' }, { status: 403 });
  }

  await service
    .from('cohost_workspace_members')
    .upsert({
      workspace_id: invite.workspace_id,
      user_id: user.id,
      role: 'member',
      role_label: invite.role_label,
      can_view_calendar: invite.can_view_calendar,
      can_view_guest_name: invite.can_view_guest_name,
      can_view_guest_count: invite.can_view_guest_count,
      can_view_booking_notes: invite.can_view_booking_notes,
      can_view_contact_info: invite.can_view_contact_info,
      is_active: true,
    }, { onConflict: 'workspace_id, user_id' });

  await service
    .from('cohost_workspace_invites')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
    })
    .eq('id', invite.id);

  return NextResponse.json({ success: true, workspace_id: invite.workspace_id });
}
