import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ICalProcessor } from '@/lib/services/ical-processor';
import { EmailProcessor } from '@/lib/services/email-processor';
import { DBLock } from '@/lib/utils/db-lock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow 5 minutes for cron

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Acquire DB Lock
    const lock = new DBLock();
    let acquired = false;
    try {
        acquired = await lock.acquire();
    } catch (e) {
        console.error('[CRON] Error acquiring lock:', e);
        return NextResponse.json({ error: 'Failed to acquire lock' }, { status: 500 });
    }

    if (!acquired) {
        console.log(JSON.stringify({ event: "cron_refresh_skipped_locked", timestamp: new Date().toISOString() }));
        return NextResponse.json({ status: "skipped_locked" });
    }

    const start = Date.now();
    console.log(JSON.stringify({ event: "cron_refresh_start", timestamp: new Date().toISOString() }));

    try {
        const supabase = await createClient();

        // 2. Fetch all active iCal feeds
        const { data: feeds, error: feedsError } = await supabase
            .from('ical_feeds')
            .select('id, property_id, source_name, source_type, ical_url, name, cohost_properties(workspace_id)')
            .eq('is_active', true);

        if (feedsError || !feeds) {
            throw new Error(`Failed to fetch iCal feeds: ${feedsError?.message}`);
        }

        let totalProcessedCount = 0;
        const affectedWorkspaceIds = new Set<string>();

        // 3. Process iCal Feeds sequentially
        for (const feed of feeds) {
            // @ts-ignore - cohost_properties join is a single object here, assuming standard schema relation
            const workspaceId = Array.isArray(feed.cohost_properties) ? feed.cohost_properties[0]?.workspace_id : feed.cohost_properties?.workspace_id;

            if (!workspaceId) continue;

            const result = await ICalProcessor.syncFeed({
                id: feed.id,
                property_id: feed.property_id,
                source_name: feed.source_name,
                source_type: feed.source_type,
                ical_url: feed.ical_url,
                name: feed.name || ''
            }, workspaceId);

            if (result.processed_count > 0) {
                totalProcessedCount += result.processed_count;
                affectedWorkspaceIds.add(workspaceId);
            }
        }

        // 4. Gate Gmail ingestion based on iCal changes
        if (totalProcessedCount === 0) {
            console.log(JSON.stringify({ event: "cron_refresh_end", status: "no_changes", duration_ms: Date.now() - start }));
            return NextResponse.json({ status: "no_changes", gmail_triggered: false });
        }

        // 5. Gmail Ingestion + Enrichment for affected workspaces
        const connectionsSynced: string[] = [];
        const gmailFailedConnections: string[] = [];

        for (const workspaceId of Array.from(affectedWorkspaceIds)) {
            const { data: connections } = await supabase
                .from('connections')
                .select('id')
                .eq('workspace_id', workspaceId)
                .not('gmail_refresh_token', 'is', null);

            if (!connections || connections.length === 0) continue;

            for (const connection of connections) {
                const connStart = Date.now();
                let success = false;
                let errorMessage = null;
                let scanCount = 0;
                let enrichCount = 0;
                let missingCount = 0;

                try {
                    // a) Process Messages
                    const scanResults = await EmailProcessor.processMessages(connection.id);
                    scanCount = scanResults.length;

                    // b) Enrich Bookings
                    const enrichResults = await EmailProcessor.enrichBookings(connection.id);
                    enrichCount = enrichResults.enriched;
                    missingCount = enrichResults.missing;

                    success = true;
                    connectionsSynced.push(connection.id);
                } catch (e: any) {
                    errorMessage = e.message || 'Unknown error during EmailProcessor';
                    gmailFailedConnections.push(connection.id);
                }

                // Log to new gmail_sync_log table
                await supabase.from('gmail_sync_log').insert({
                    workspace_id: workspaceId,
                    connection_id: connection.id,
                    success,
                    error_message: errorMessage,
                    emails_scanned: scanCount,
                    bookings_enriched: enrichCount,
                    review_items_created: missingCount,
                    duration_ms: Date.now() - connStart
                });
            }
        }

        const runStatus = gmailFailedConnections.length > 0 && connectionsSynced.length > 0 ? "partial_ok" :
            gmailFailedConnections.length > 0 ? "error" : "ok";

        const endEvent = {
            event: "cron_refresh_end",
            status: runStatus,
            total_processed_count: totalProcessedCount,
            gmail_triggered: true,
            connections_synced: connectionsSynced,
            gmail_failed_connections: gmailFailedConnections,
            duration_ms: Date.now() - start
        };

        console.log(JSON.stringify(endEvent));
        return NextResponse.json(endEvent);

    } finally {
        await lock.release();
    }
}
