// API route to get the current user's role in their workspace
import { NextResponse } from 'next/server';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
    const { user, workspaceId } = await getCurrentUserWithWorkspace();
    if (!user || !workspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { data: member } = await supabase
        .from('cohost_workspace_members')
        .select('role, role_label, is_active')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single();

    console.log(`[Role API] User: ${user.email}, Workspace: ${workspaceId}, Role: ${member?.role}, Active: ${member?.is_active}`);

    if (!member?.is_active) {
        return NextResponse.json({ error: 'Inactive member' }, { status: 403 });
    }

    return NextResponse.json({
        role: member.role || 'member',
        role_label: member.role_label,
    });
}
