import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';

export async function POST(request: NextRequest) {
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { type, id } = await request.json();
  if (!type || !id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

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

  if (type === 'member') {
    await service
      .from('cohost_workspace_members')
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: user.id,
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId);
  }

  if (type === 'invite') {
    await service
      .from('cohost_workspace_invites')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId);
  }

  return NextResponse.json({ success: true });
}
