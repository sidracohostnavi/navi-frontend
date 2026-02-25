
import { NextRequest, NextResponse } from 'next/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';

export async function GET(request: NextRequest, props: { params: Promise<{ userId: string }> }) {
    const params = await props.params;
    const { user, workspaceId } = await getCurrentUserWithWorkspace();
    if (!user || !workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = createCohostServiceClient();

    // Check permission: requester must be owner/admin of workspace
    const { data: membership, error: memError } = await service
        .from('cohost_workspace_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('workspace_id', workspaceId)
        .single();

    if (memError || !membership || !['owner', 'admin'].includes(membership.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch assignments
    const { data } = await service
        .from('cohost_user_properties')
        .select('property_id')
        .eq('user_id', params.userId)
        .eq('workspace_id', workspaceId);

    return NextResponse.json({ propertyIds: (data || []).map((d: any) => d.property_id) });
}

export async function POST(request: NextRequest, props: { params: Promise<{ userId: string }> }) {
    const params = await props.params;
    const { user, workspaceId } = await getCurrentUserWithWorkspace();
    if (!user || !workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { propertyIds } = body;

    const service = createCohostServiceClient();

    // Check permission
    const { data: membership, error: memError } = await service
        .from('cohost_workspace_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('workspace_id', workspaceId)
        .single();

    if (memError || !membership || !['owner', 'admin'].includes(membership.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Replace existing assignments
    const { error: deleteError } = await service
        .from('cohost_user_properties')
        .delete()
        .eq('user_id', params.userId)
        .eq('workspace_id', workspaceId);

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    // Insert new assignments if any
    if (propertyIds && Array.isArray(propertyIds) && propertyIds.length > 0) {
        const rows = propertyIds.map((pid: string) => ({
            user_id: params.userId,
            workspace_id: workspaceId,
            property_id: pid
        }));

        const { error: insertError } = await service
            .from('cohost_user_properties')
            .insert(rows);

        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
