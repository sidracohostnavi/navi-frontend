import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';

export async function POST(request: NextRequest) {
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { invitee_name, invitee_email, role_label, permissions } = body || {};

  if (!invitee_email || !permissions?.can_view_calendar) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: member } = await supabase
    .from('cohost_workspace_members')
    .select('role, is_active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!member?.is_active || !['owner', 'admin'].includes(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const tokenLast4 = token.slice(-4);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const service = createCohostServiceClient();
  const { data: invite, error: inviteError } = await service
    .from('cohost_workspace_invites')
    .insert({
      workspace_id: workspaceId,
      invitee_email: invitee_email.toLowerCase(),
      invitee_name: invitee_name || null,
      role_label: role_label || null,
      can_view_calendar: !!permissions.can_view_calendar,
      can_view_guest_name: !!permissions.can_view_guest_name,
      can_view_guest_count: !!permissions.can_view_guest_count,
      can_view_booking_notes: !!permissions.can_view_booking_notes,
      can_view_contact_info: !!permissions.can_view_contact_info,
      token_hash: tokenHash,
      token_last4: tokenLast4,
      invited_by: user.id,
      expires_at: expiresAt,
    })
    .select('id, invitee_email, expires_at')
    .single();

  if (inviteError || !invite) {
    return NextResponse.json({ error: inviteError?.message || 'Invite failed' }, { status: 500 });
  }

  const inviteUrl = `${request.nextUrl.origin}/cohost/invite?token=${token}`;

  try {
    await service.auth.admin.inviteUserByEmail(invite.invitee_email, {
      redirectTo: inviteUrl,
    });
  } catch (e) {
    // Email sending may fail; return invite URL for manual copy
  }

  return NextResponse.json({
    success: true,
    invite_id: invite.id,
    invite_url: inviteUrl,
    expires_at: invite.expires_at,
  });
}
