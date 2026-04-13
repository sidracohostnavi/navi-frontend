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
        { count: totalWorkspaces },
        { count: totalProperties },
        { count: activeFeeds },
        { data: connections },
        { data: invites },
    ] = await Promise.all([
        service.auth.admin.listUsers({ perPage: 1000 }),
        service.from('cohost_workspaces').select('id', { count: 'exact', head: true }),
        service.from('cohost_properties').select('id', { count: 'exact', head: true }),
        service.from('ical_feeds').select('id', { count: 'exact', head: true }).eq('is_active', true),
        service.from('connections').select('id, gmail_status, gmail_refresh_token'),
        service.from('cohost_signup_invites').select('id, used_at, revoked'),
    ]);

    const gmailConnected = (connections || []).filter(c => c.gmail_refresh_token);
    const gmailBroken = gmailConnected.filter(
        c => c.gmail_status === 'error' || c.gmail_status === 'needs_reconnect'
    );

    const totalInvites = (invites || []).length;
    const usedInvites = (invites || []).filter(i => i.used_at).length;
    const activeInvites = (invites || []).filter(i => !i.used_at && !i.revoked).length;

    return NextResponse.json({
        totalUsers: users?.length || 0,
        totalWorkspaces: totalWorkspaces || 0,
        totalProperties: totalProperties || 0,
        activeFeeds: activeFeeds || 0,
        gmail: {
            connected: gmailConnected.length,
            broken: gmailBroken.length,
        },
        invites: {
            total: totalInvites,
            used: usedInvites,
            active: activeInvites,
        },
    });
}
