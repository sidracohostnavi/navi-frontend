import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { EmailProcessor } from '@/lib/services/email-processor';
import { ICalProcessor } from '@/lib/services/ical-processor';

/**
 * POST /api/cohost/refresh
 * 
 * GLOBAL Refresh Endpoint
 * 1. Re-runs email enrichment for all connections
 * 2. SYNC ALL ACTIVE ICAL FEEDS for the workspace
 * 3. Decorates existing bookings
 * 
 * SAFETY: Idempotent and safe.
 */
export async function POST() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // 1. Get Workspace
        const { data: membership } = await supabase
            .from('cohost_workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

        if (!membership?.workspace_id) {
            return NextResponse.json({ success: true, message: 'No workspace found' });
        }
        const workspaceId = membership.workspace_id;

        // 2. Refresh Email Connections
        const { data: connections } = await supabase
            .from('connections')
            .select('id')
            .eq('workspace_id', workspaceId);

        let totalEnriched = 0;
        let totalMissing = 0;
        let totalReviewItems = 0;

        if (connections) {
            for (const conn of connections) {
                try {
                    const enrichRes = await EmailProcessor.enrichBookings(conn.id);
                    totalEnriched += enrichRes.enriched;
                    totalMissing += enrichRes.missing;
                } catch (e) {
                    console.error(`[Refresh] Email error for ${conn.id}:`, e);
                }
            }
        }

        // 3. Refresh ALL Active iCal Feeds
        // We need to fetch properties for this workspace first to be safe, 
        // or just join ical_feeds on properties filtering by workspace_id.
        const { data: feeds } = await supabase
            .from('ical_feeds')
            .select('*, cohost_properties!inner(workspace_id)')
            .eq('is_active', true)
            .eq('cohost_properties.workspace_id', workspaceId);

        let totalFeedsSynced = 0;
        let totalCalendarEvents = 0;

        if (feeds) {
            console.log(`[Refresh] Found ${feeds.length} active feeds to sync.`);
            for (const feed of feeds) {
                try {
                    // map feed to match interface if needed (omit the joined property obj)
                    const { cohost_properties, ...cleanFeed } = feed;
                    const res = await ICalProcessor.syncFeed(cleanFeed as any, workspaceId);
                    if (res.success) {
                        totalFeedsSynced++;
                        totalCalendarEvents += res.events_found;
                    }
                } catch (e) {
                    console.error(`[Refresh] Feed sync error ${feed.id}:`, e);
                }
            }
        }

        revalidatePath('/cohost/calendar');
        revalidatePath('/cohost/settings/calendar');

        return NextResponse.json({
            success: true,
            email_stats: {
                enriched: totalEnriched,
                missing: totalMissing,
                review_items: totalReviewItems
            },
            calendar_stats: {
                feeds_synced: totalFeedsSynced,
                events_found: totalCalendarEvents
            }
        });

    } catch (err: any) {
        console.error('[Refresh] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
