import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

// PATCH /api/cohost/properties/[id] — disable or re-enable
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const admin = createCohostServiceClient();

    // Verify property belongs to this user's workspace
    const { data: prop } = await admin
        .from('cohost_properties')
        .select('id, workspace_id')
        .eq('id', id)
        .maybeSingle();
    if (!prop) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { error } = await admin
        .from('cohost_properties')
        .update({ is_active: body.is_active })
        .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}

// DELETE /api/cohost/properties/[id] — hard delete
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createCohostServiceClient();

    // Verify ownership
    const { data: prop } = await admin
        .from('cohost_properties')
        .select('id, workspace_id')
        .eq('id', id)
        .maybeSingle();
    if (!prop) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { error } = await admin
        .from('cohost_properties')
        .delete()
        .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
