import { NextResponse } from 'next/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';

export async function GET() {
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    .select('id, invitee_email, invitee_name, role_label, status, created_at, expires_at, can_view_calendar, can_view_guest_name, can_view_guest_count, can_view_booking_notes, can_view_contact_info')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return NextResponse.json({ members: membersWithEmail, invites: invites || [] });
}
