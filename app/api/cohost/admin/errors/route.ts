import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/authServer';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

function getAdminEmails(): string[] {
    return (process.env.DEV_SUPPORT_EMAILS || 'sidra.navicohost@gmail.com')
        .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

export async function GET() {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !getAdminEmails().includes(user.email?.toLowerCase() || '')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const service = createCohostServiceClient();

    // Fetch connections with error status, plus workspace info for context
    const [{ data: connections }, { data: workspaces }] = await Promise.all([
        service
            .from('connections')
            .select('id, workspace_id, gmail_status, gmail_last_error_message, gmail_last_success_at, gmail_last_verified_at')
            .in('gmail_status', ['error', 'needs_reconnect'])
            .not('gmail_last_error_message', 'is', null)
            .order('gmail_last_verified_at', { ascending: false })
            .limit(20),
        service.from('cohost_workspaces').select('id, owner_id, name'),
    ]);

    // Get owner emails for context
    const ownerIds = (workspaces || []).map(w => w.owner_id);
    const { data: { users: authUsers } } = ownerIds.length > 0
        ? await service.auth.admin.listUsers({ perPage: 1000 })
        : { data: { users: [] } };

    const emailByUserId = new Map((authUsers || []).map(u => [u.id, u.email]));
    const workspaceById = new Map((workspaces || []).map(w => [w.id, w]));

    const errors = (connections || []).map(c => {
        const ws = workspaceById.get(c.workspace_id);
        const ownerEmail = ws ? (emailByUserId.get(ws.owner_id) || null) : null;
        return {
            connection_id: c.id,
            workspace_id: c.workspace_id,
            workspace_name: ws?.name || null,
            owner_email: ownerEmail,
            gmail_status: c.gmail_status,
            error_message: c.gmail_last_error_message,
            last_success_at: c.gmail_last_success_at,
            error_at: c.gmail_last_verified_at,
        };
    });

    return NextResponse.json({ errors });
}
