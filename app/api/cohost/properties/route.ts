import { NextResponse } from 'next/server';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

// Minimal list endpoint: returns id + name for all workspace properties.
// Used by task creation form and other places that need a property picker.
export async function GET() {
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createCohostServiceClient();

  const { data: member } = await service
    .from('cohost_workspace_members')
    .select('role, is_active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!member?.is_active) {
    return NextResponse.json({ error: 'Inactive member' }, { status: 403 });
  }

  const { data: properties, error } = await service
    .from('cohost_properties')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ properties: properties || [] });
}
