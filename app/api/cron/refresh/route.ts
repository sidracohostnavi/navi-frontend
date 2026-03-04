import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ICalProcessor } from '@/lib/services/ical-processor';
import { DBLock } from '@/lib/utils/db-lock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow 1 minute for cron

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
        // Use service role to bypass RLS for logging
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        console.log(`[TEMP] NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);

        // 2. Fetch all active iCal feeds, ordered by last_synced_at ascending (nulls first)
        const { data: allFeeds, error: feedsError } = await supabase
            .from('ical_feeds')
            .select('id, property_id, source_name, source_type, ical_url, name, last_synced_at')
            .eq('is_active', true)
            .order('last_synced_at', { ascending: true, nullsFirst: true });

        if (feedsError || !allFeeds) {
            throw new Error(`Failed to fetch iCal feeds: ${feedsError?.message}`);
        }

        const feeds = allFeeds; // Process all active feeds every cycle
        const selectedFeedIds = feeds.map(f => f.id);

        console.log(`CRON_REFRESH_HIT ${new Date().toISOString()}`);
        console.log(`ACTIVE_FEEDS_TOTAL ${allFeeds.length}`);
        console.log(`FEEDS_SELECTED ${JSON.stringify(selectedFeedIds)}`);

        // 2b. Map property_ids to workspace_ids
        const propertyIds = Array.from(new Set(feeds.map(f => f.property_id)));
        const { data: properties } = await supabase
            .from('cohost_properties')
            .select('id, workspace_id')
            .in('id', propertyIds);

        const workspaceMap = new Map((properties || []).map(p => [p.id, p.workspace_id]));

        let totalProcessedCount = 0;
        const affectedWorkspaceIds = new Set<string>();

        // 3. Process iCal Feeds sequentially (time-budgeted)
        const TIME_BUDGET_MS = 25000; // Stop after 25s — cron-job.org has 30s timeout

        for (const feed of feeds) {
            // Check time budget before starting next feed
            if (Date.now() - start > TIME_BUDGET_MS) {
                console.log(`[CRON] Time budget exhausted after ${Date.now() - start}ms, processed ${totalProcessedCount} events`);
                break;
            }

            const workspaceId = workspaceMap.get(feed.property_id);

            if (!workspaceId) {
                console.log(`[TEMP] Skipping feed ${feed.id} because workspaceId is missing`);
                continue;
            }

            console.log(`SYNC_START ${feed.id}`);
            try {
                const result = await ICalProcessor.syncFeed({
                    id: feed.id,
                    property_id: feed.property_id,
                    source_name: feed.source_name,
                    source_type: feed.source_type,
                    ical_url: feed.ical_url,
                    name: feed.name || ''
                }, workspaceId, supabase);

                console.log(`SYNC_END ${feed.id} ${result.processed_count}`);

                if (result.processed_count > 0) {
                    totalProcessedCount += result.processed_count;
                    affectedWorkspaceIds.add(workspaceId);
                }
            } catch (err: any) {
                console.error(`syncFeed_error feed_id=${feed.id}: ${err.message}`);
            } // no-op
        }

        // 4. iCal sync complete — Gmail enrichment handled by separate /api/cron/enrichment endpoint

        const endEvent = {
            event: "cron_refresh_end",
            status: "ok",
            feeds_total: allFeeds.length,
            feeds_processed: feeds.length,
            feed_ids_processed: selectedFeedIds,
            total_processed_count: totalProcessedCount,
            duration_ms: Date.now() - start
        };

        console.log(JSON.stringify(endEvent));
        return NextResponse.json(endEvent);

    } finally {
        await lock.release();
    }
}
