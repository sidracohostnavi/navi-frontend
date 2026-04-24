/**
 * GET /api/cohost/messaging/diagnostic
 *
 * Step-by-step diagnostic that mirrors exactly what backfillForWorkspace does,
 * returning the count at each stage so we can see where the chain breaks.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { classifyEmail } from '@/lib/services/email-classifier';

export const dynamic = 'force-dynamic';

export async function GET() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: member } = await supabase
        .from('cohost_workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!member?.workspace_id) return NextResponse.json({ error: 'No workspace found' }, { status: 403 });

    const workspaceId = member.workspace_id;
    const steps: Record<string, any> = {};

    // ── Step 1: Gmail connections (includes null workspace_id legacy rows) ────────
    const { data: allConnections } = await supabase
        .from('connections')
        .select('id, gmail_status, reservation_label, workspace_id');

    const connected = (allConnections || []).filter(
        c => c.gmail_status === 'connected' &&
        (c.workspace_id === workspaceId || c.workspace_id === null)
    );
    const connectionIds = connected.map(c => c.id);

    steps.connections = {
        total_in_workspace_or_orphan: allConnections?.length ?? 0,
        connected: connected.length,
        ids: connectionIds,
        detail: connected.map(c => ({ id: c.id, label: c.reservation_label, workspace_id: c.workspace_id })),
    };

    if (!connectionIds.length) {
        return NextResponse.json({ workspace_id: workspaceId, steps, blocked_at: 'connections' });
    }

    // ── Step 2: Properties via connection_properties ──────────────────────────────
    const { data: connProps } = await supabase
        .from('connection_properties')
        .select('property_id, connection_id')
        .in('connection_id', connectionIds);

    let propertyIds: string[] = [...new Set<string>((connProps || []).map(cp => cp.property_id))];

    steps.connection_properties = {
        rows_found: connProps?.length ?? 0,
        property_ids: propertyIds,
    };

    if (!propertyIds.length) {
        // Fallback: all workspace properties
        const { data: wsProps } = await supabase
            .from('cohost_properties')
            .select('id, name')
            .eq('workspace_id', workspaceId);
        propertyIds = (wsProps || []).map(p => p.id);
        steps.connection_properties.fallback_used = true;
        steps.connection_properties.fallback_properties = wsProps?.map(p => ({ id: p.id, name: p.name }));
    }

    if (!propertyIds.length) {
        return NextResponse.json({ workspace_id: workspaceId, steps, blocked_at: 'properties' });
    }

    // ── Step 3: Active / future bookings with enriched_guest_name ─────────────────
    const today = new Date().toISOString().split('T')[0];
    const { data: bookings } = await supabase
        .from('bookings')
        .select('id, enriched_guest_name, guest_name, check_in, check_out, property_id, workspace_id, status, is_active')
        .in('property_id', propertyIds)
        .gte('check_out', today);

    const allBookings = bookings || [];
    const withName = allBookings.filter(b => b.enriched_guest_name);
    const noName   = allBookings.filter(b => !b.enriched_guest_name);

    steps.bookings = {
        total_active_future: allBookings.length,
        with_enriched_name: withName.length,
        without_enriched_name: noName.length,
        sample_with_name: withName.slice(0, 3).map(b => ({
            id: b.id,
            name: b.enriched_guest_name,
            check_in: b.check_in,
            check_out: b.check_out,
            status: b.status,
            is_active: b.is_active,
        })),
        sample_without_name: noName.slice(0, 3).map(b => ({
            id: b.id,
            guest_name: b.guest_name,
            check_in: b.check_in,
        })),
    };

    if (!withName.length) {
        return NextResponse.json({ workspace_id: workspaceId, steps, blocked_at: 'bookings_no_enriched_name' });
    }

    // ── Step 4: Email matching — run ilike for first 3 bookings ──────────────────
    steps.email_matching = [];
    for (const booking of withName.slice(0, 3)) {
        const guestName = booking.enriched_guest_name as string;
        const { data: candidates } = await supabase
            .from('gmail_messages')
            .select('gmail_message_id, subject, snippet, message_type, processed_at, thread_id')
            .in('connection_id', connectionIds)
            .ilike('subject', `%${guestName}%`)
            .order('created_at', { ascending: false })
            .limit(10);

        const guestEmails = (candidates || []).filter(e => {
            const result = classifyEmail(e.subject || '', e.snippet || '');
            return result.message_type === 'guest_message';
        });

        steps.email_matching.push({
            guest_name: guestName,
            booking_id: booking.id,
            ilike_matches: candidates?.length ?? 0,
            classified_as_guest_message: guestEmails.length,
            sample_subjects: candidates?.slice(0, 5).map(e => ({
                subject: e.subject,
                current_message_type: e.message_type,
                processed_at: e.processed_at,
            })),
        });
    }

    // ── Step 5: Relay email patterns — do ANY relay-style emails exist? ──────────
    const relayPatterns = [
        '%sent you a message%',
        '%Message from%',
        '%New message from%',
        '%You have a new message%',
        '%replied to your message%',
    ];

    const relaySample: any[] = [];
    for (const pattern of relayPatterns) {
        const { data: relayEmails } = await supabase
            .from('gmail_messages')
            .select('gmail_message_id, subject, message_type, processed_at')
            .in('connection_id', connectionIds)
            .ilike('subject', pattern)
            .limit(3);
        if (relayEmails?.length) {
            relaySample.push({ pattern, count: relayEmails.length, subjects: relayEmails.map(e => e.subject) });
        }
    }

    // Also show total email count per connection
    const { data: totalByConn } = await supabase
        .from('gmail_messages')
        .select('connection_id')
        .in('connection_id', connectionIds);

    const countByConn: Record<string, number> = {};
    for (const row of totalByConn || []) {
        countByConn[row.connection_id] = (countByConn[row.connection_id] || 0) + 1;
    }

    steps.relay_email_search = {
        patterns_with_matches: relaySample,
        total_relay_emails_found: relaySample.reduce((sum, r) => sum + r.count, 0),
        total_emails_per_connection: countByConn,
        conclusion: relaySample.length === 0
            ? 'NO relay-style emails found in gmail_messages at all. Either guests have not messaged yet, or relay emails are not being captured (check Gmail label covers message relays, not just confirmations).'
            : `Found ${relaySample.reduce((sum, r) => sum + r.count, 0)} relay email(s). The backfill should work once bookings are matched correctly.`,
    };

    // ── Step 6: Existing conversations and messages ───────────────────────────────
    const { data: convs } = await supabase
        .from('cohost_conversations')
        .select('id, booking_id, channel, last_message_at, unread_count')
        .eq('workspace_id', workspaceId);

    const { count: msgCount } = await supabase
        .from('cohost_messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', (convs || []).map(c => c.id));

    steps.existing_data = {
        conversations: convs?.length ?? 0,
        messages: msgCount ?? 0,
        sample_convs: convs?.slice(0, 3),
    };

    return NextResponse.json({ workspace_id: workspaceId, steps });
}
