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

  // Validate role against allowed values in the database CHECK constraint
  const VALID_ROLES = ['owner', 'admin', 'manager', 'cleaner'];
  const assignedRole = invite.role && VALID_ROLES.includes(invite.role) ? invite.role : 'cleaner';

  console.log('[accept] DEBUG invite.role:', JSON.stringify(invite.role), 'assignedRole:', assignedRole, 'role_label:', JSON.stringify(invite.role_label));

  // 1. Create/update membership in the INVITER's workspace
  const { error: memberError } = await service
    .from('cohost_workspace_members')
    .upsert({
      workspace_id: invite.workspace_id,
      user_id: user.id,
      role: assignedRole,
      role_label: invite.role_label || assignedRole,
      can_view_calendar: invite.can_view_calendar ?? true,
      can_view_guest_name: invite.can_view_guest_name ?? false,
      can_view_guest_count: invite.can_view_guest_count ?? false,
      can_view_booking_notes: invite.can_view_booking_notes ?? false,
      can_view_contact_info: invite.can_view_contact_info ?? false,
      is_active: true,
    }, { onConflict: 'workspace_id, user_id' });

  if (memberError) {
    console.error('[accept] Failed to create membership:', memberError);
    return NextResponse.json({ error: 'Failed to create membership', details: memberError.message }, { status: 500 });
  }

  // 2. Set workspace preference to the INVITER's workspace
  const { error: prefError } = await service
    .from('cohost_user_preferences')
    .upsert({
      user_id: user.id,
      workspace_id: invite.workspace_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (prefError) {
    console.error('[accept] Failed to set workspace preference:', prefError);
    return NextResponse.json({ error: 'Failed to set workspace preference', details: prefError.message }, { status: 500 });
  }

  // 3. Mark invite as accepted (ONLY after membership + preference succeed)
  const { error: updateError } = await service
    .from('cohost_workspace_invites')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
    })
    .eq('id', invite.id);

  if (updateError) {
    console.error('[accept] Failed to update invite status:', updateError);
  }

  return NextResponse.json({ success: true, workspace_id: invite.workspace_id });
}
