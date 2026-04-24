/**
 * POST /api/cohost/messaging/classify
 *
 * Step 1 of the import flow. Classifies all gmail_messages rows that have
 * message_type = NULL by running the subject+snippet through the email classifier.
 * This is a fast operation (no raw_metadata fetch, no email processing).
 *
 * Safe to run multiple times. After this succeeds, call /api/cohost/messaging/backfill
 * to turn guest_message rows into conversations.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { classifyEmail } from '@/lib/services/email-classifier';

export const dynamic = 'force-dynamic';

export async function POST() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: member } = await supabase
        .from('cohost_workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!member?.workspace_id) {
        return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }

    const workspaceId = member.workspace_id;

    const { data: connections } = await supabase
        .from('connections')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('gmail_status', 'connected');

    if (!connections?.length) {
        return NextResponse.json({ classified: 0, by_type: {}, message: 'No connected Gmail accounts' });
    }

    const connectionIds = connections.map(c => c.id);

    // Fetch all null-type rows — subject + snippet only (no raw_metadata, no timeouts)
    const { data: rows, error } = await supabase
        .from('gmail_messages')
        .select('gmail_message_id, subject, snippet')
        .in('connection_id', connectionIds)
        .is('message_type', null);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!rows?.length) {
        return NextResponse.json({ classified: 0, by_type: {}, message: 'No unclassified emails found' });
    }

    console.log(`[Classify] ${rows.length} null-type rows to classify`);

    // Group by classified type for bulk updates
    const typeGroups: Record<string, string[]> = {};
    for (const row of rows) {
        const result = classifyEmail(row.subject || '', row.snippet || '');
        const t = result.message_type;
        if (!typeGroups[t]) typeGroups[t] = [];
        typeGroups[t].push(row.gmail_message_id);
    }

    // Bulk update, one query per type (chunked to avoid IN list limits)
    const CHUNK = 500;
    let totalClassified = 0;
    for (const [msgType, ids] of Object.entries(typeGroups)) {
        for (let i = 0; i < ids.length; i += CHUNK) {
            const { error: updateError } = await supabase
                .from('gmail_messages')
                .update({ message_type: msgType })
                .in('gmail_message_id', ids.slice(i, i + CHUNK));
            if (updateError) {
                console.error(`[Classify] Update error for type ${msgType}:`, updateError.message);
            }
        }
        totalClassified += ids.length;
        console.log(`[Classify] ${ids.length} rows → ${msgType}`);
    }

    const guestCount = typeGroups['guest_message']?.length ?? 0;
    const message = guestCount > 0
        ? `Classified ${totalClassified} emails — ${guestCount} are guest messages ready to import`
        : `Classified ${totalClassified} emails — no guest messages found. Check Gmail label settings.`;

    return NextResponse.json({
        classified: totalClassified,
        guest_messages_found: guestCount,
        by_type: Object.fromEntries(Object.entries(typeGroups).map(([k, v]) => [k, v.length])),
        message,
    });
}
