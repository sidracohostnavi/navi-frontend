/**
 * POST /api/cohost/messaging/backfill
 *
 * One-click import for hosts. Finds all active/future bookings that have a
 * known guest name (enriched from reservation confirmation emails), searches
 * Gmail for relay messages from those guests, and populates the inbox.
 *
 * Safe to call repeatedly — already-imported messages are skipped.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MessageProcessor } from '@/lib/services/message-processor';

export const dynamic = 'force-dynamic';

export async function POST() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabase
        .from('cohost_workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!member?.workspace_id) {
        return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }

    const stats = await MessageProcessor.backfillForWorkspace(member.workspace_id, supabase);

    let message: string;
    if (stats.bookings_processed === 0) {
        message = 'No active bookings found. Check that your Gmail connections are set up and enrichment has run.';
    } else if (stats.messages_created > 0 && stats.conversations_created > 0) {
        message = `Created ${stats.conversations_created} conversation${stats.conversations_created !== 1 ? 's' : ''} and imported ${stats.messages_created} message${stats.messages_created !== 1 ? 's' : ''}`;
    } else if (stats.messages_created > 0) {
        message = `Imported ${stats.messages_created} message${stats.messages_created !== 1 ? 's' : ''}`;
    } else if (stats.conversations_created > 0) {
        message = `Created ${stats.conversations_created} conversation${stats.conversations_created !== 1 ? 's' : ''} for active bookings — no guest messages found yet`;
    } else {
        message = `Inbox is up to date — ${stats.bookings_processed} booking${stats.bookings_processed !== 1 ? 's' : ''} checked`;
    }

    return NextResponse.json({
        message,
        total_imported: stats.messages_created,
        conversations_created: stats.conversations_created,
        bookings_processed: stats.bookings_processed,
    });
}
