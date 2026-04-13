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

    const [
        { data: { users } },
        { data: workspaces },
        { data: properties },
        { data: connections },
        { data: feeds },
        { data: workspaceMembers },
    ] = await Promise.all([
        service.auth.admin.listUsers({ perPage: 1000 }),
        service.from('cohost_workspaces').select('id, owner_id, name, created_at'),
        service.from('cohost_properties').select('id, workspace_id'),
        service.from('connections').select('id, workspace_id, gmail_status, gmail_refresh_token, gmail_last_success_at, gmail_last_error_message'),
        service.from('ical_feeds').select('id, property_id, is_active, last_synced_at').eq('is_active', true),
        service.from('cohost_workspace_members').select('user_id, workspace_id, role, is_active'),
    ]);

    // Set of user_ids who own at least one workspace
    const ownerIds = new Set((workspaces || []).map(w => w.owner_id));

    // Set of user_ids who are team members (in workspace_members but NOT owners of any workspace)
    const teamMemberIds = new Set(
        (workspaceMembers || [])
            .filter(m => m.is_active && !ownerIds.has(m.user_id))
            .map(m => m.user_id)
    );

    // Build lookup maps
    const workspaceByOwnerId = new Map((workspaces || []).map(w => [w.owner_id, w]));

    const propCountByWorkspace = new Map<string, number>();
    for (const p of properties || []) {
        propCountByWorkspace.set(p.workspace_id, (propCountByWorkspace.get(p.workspace_id) || 0) + 1);
    }

    const connectionsByWorkspace = new Map<string, typeof connections[0][]>();
    for (const c of connections || []) {
        const list = connectionsByWorkspace.get(c.workspace_id) || [];
        list.push(c);
        connectionsByWorkspace.set(c.workspace_id, list);
    }

    // Map property_id → last_synced_at for active iCal feeds
    const icalSyncByPropId = new Map<string, string>();
    for (const f of feeds || []) {
        if (f.last_synced_at) {
            const existing = icalSyncByPropId.get(f.property_id);
            if (!existing || f.last_synced_at > existing) {
                icalSyncByPropId.set(f.property_id, f.last_synced_at);
            }
        }
    }

    // Map workspace_id → most recent ical last_synced_at
    const icalLastSyncByWorkspace = new Map<string, string>();
    for (const p of properties || []) {
        const feedSync = icalSyncByPropId.get(p.id);
        if (feedSync) {
            const existing = icalLastSyncByWorkspace.get(p.workspace_id);
            if (!existing || feedSync > existing) {
                icalLastSyncByWorkspace.set(p.workspace_id, feedSync);
            }
        }
    }

    // Map workspace_id → whether any property has an active feed
    const hasIcalByWorkspace = new Map<string, boolean>();
    for (const p of properties || []) {
        if (icalSyncByPropId.has(p.id)) {
            hasIcalByWorkspace.set(p.workspace_id, true);
        }
    }

    const result = (users || [])
        // Filter out @example.com test accounts
        .filter(u => u.email && !u.email.toLowerCase().endsWith('@example.com'))
        // Filter out team members (cleaners, operators etc.) — not workspace owners
        .filter(u => !teamMemberIds.has(u.id))
        .map(u => {
            const workspace = workspaceByOwnerId.get(u.id);
            const wsId = workspace?.id;
            const propCount = wsId ? (propCountByWorkspace.get(wsId) || 0) : 0;
            const wsConnections = wsId ? (connectionsByWorkspace.get(wsId) || []) : [];
            const gmailConn = wsConnections.find(c => c.gmail_refresh_token);
            const hasIcal = wsId ? (hasIcalByWorkspace.get(wsId) || false) : false;
            const icalLastSynced = wsId ? (icalLastSyncByWorkspace.get(wsId) || null) : null;
            const gmailBroken = gmailConn
                ? gmailConn.gmail_status === 'error' || gmailConn.gmail_status === 'needs_reconnect'
                : false;

            const daysSinceSignup = Math.floor(
                (Date.now() - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24)
            );

            return {
                id: u.id,
                email: u.email,
                created_at: u.created_at,
                email_confirmed: !!u.email_confirmed_at,
                workspace_id: wsId || null,
                property_count: propCount,
                gmail_connected: !!gmailConn,
                gmail_status: gmailConn?.gmail_status || null,
                gmail_last_success: gmailConn?.gmail_last_success_at || null,
                gmail_last_error: gmailConn?.gmail_last_error_message || null,
                gmail_broken: gmailBroken,
                has_ical: hasIcal,
                ical_last_synced_at: icalLastSynced,
                days_since_signup: daysSinceSignup,
            };
        });

    // Sort: newest first
    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ users: result });
}
