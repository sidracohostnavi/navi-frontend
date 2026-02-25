import { NextResponse } from 'next/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Role guard: only owner/admin can list team members
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

  const service = createCohostServiceClient();
  const { data: members } = await service
    .from('cohost_workspace_members')
    .select('*')
    .eq('workspace_id', workspaceId);

  const membersWithEmail = await Promise.all(
    (members || []).map(async m => {
      const { data } = await service.auth.admin.getUserById(m.user_id);
      return { ...m, email: data.user?.email || null };
    })
  );

  const { data: invites } = await service
    .from('cohost_workspace_invites')
    .select('id, invitee_email, invitee_name, role_label, role, status, created_at, expires_at, invite_url, can_view_calendar, can_view_guest_name, can_view_guest_count, can_view_booking_notes, can_view_contact_info')
    .eq('workspace_id', workspaceId)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false });

  return NextResponse.json({ members: membersWithEmail, invites: invites || [] });
}
