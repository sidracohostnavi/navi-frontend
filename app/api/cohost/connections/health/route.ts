import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: true });

    // Get user's workspace
    const { data: membership } = await supabase
        .from('cohost_workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

    if (!membership) return NextResponse.json({ ok: true });

    // Check for any unhealthy Gmail connections
    const { data: connections } = await supabase
        .from('connections')
        .select('id, name, gmail_status, gmail_last_error_message')
        .eq('workspace_id', membership.workspace_id)
        .not('gmail_refresh_token', 'is', null);

    const unhealthyConnections = connections?.filter(c =>
        c.gmail_status === 'error' ||
        c.gmail_status === 'needs_reconnect' ||
        c.gmail_status === 'disconnected'
    ) || [];

    return NextResponse.json({
        ok: unhealthyConnections.length === 0,
        unhealthy: unhealthyConnections
    });
}
