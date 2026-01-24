import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { ICalProcessor } from '@/lib/services/ical-processor';

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { property_id, feed_id } = await request.json();
        if (!property_id) return NextResponse.json({ error: 'Missing property_id' }, { status: 400 });

        // Verify property access
        const { data: property, error: propError } = await supabase
            .from('cohost_properties')
            .select('id, workspace_id')
            .eq('id', property_id)
            .single();

        if (propError || !property) {
            return NextResponse.json({ error: 'Property not found' }, { status: 404 });
        }

        // Fetch Feeds
        let query = supabase
            .from('ical_feeds')
            .select('*')
            .eq('property_id', property_id)
            .eq('is_active', true);

        if (feed_id) query = query.eq('id', feed_id);

        const { data: feeds } = await query;
        if (!feeds || feeds.length === 0) {
            return NextResponse.json({ success: true, feeds_synced: 0, events_found: 0 });
        }

        let totalEvents = 0;
        let totalProcessed = 0;

        // Process via Service
        for (const feed of feeds) {
            const result = await ICalProcessor.syncFeed(feed, property.workspace_id);
            totalEvents += result.events_found;
            totalProcessed += result.processed_count;
        }

        return NextResponse.json({
            success: true,
            feeds_synced: feeds.length,
            events_found: totalEvents,
            processed: totalProcessed
        });

    } catch (err: any) {
        console.error('Group Sync error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
