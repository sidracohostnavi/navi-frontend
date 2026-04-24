import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { EmailProcessor } from '@/lib/services/email-processor';
import { MessageProcessor } from '@/lib/services/message-processor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const start = Date.now();

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        console.log('[Cron:Enrichment] Starting scheduled enrichment');

        // Law 17: Only run if unenriched future bookings exist
        const today = new Date().toISOString().split('T')[0];
        const { count: unenrichedCount } = await supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)
            .gte('check_in', `${today}T00:00:00.000Z`)
            .is('enriched_guest_name', null);

        if ((unenrichedCount ?? 0) === 0) {
            console.log('[Cron:Enrichment] All future bookings enriched — skipping');
            return NextResponse.json({ status: 'skipped', reason: 'all_enriched', duration_ms: Date.now() - start });
        }

        console.log(`[Cron:Enrichment] ${unenrichedCount} unenriched future bookings — proceeding`);

        const { data: connections, error } = await supabase
            .from('connections')
            .select('id, workspace_id')
            .not('gmail_refresh_token', 'is', null);

        if (error) throw error;
        if (!connections || connections.length === 0) {
            return NextResponse.json({ status: 'skipped', reason: 'no_connections', duration_ms: Date.now() - start });
        }

        const results = [];
        for (const conn of connections) {
            const connStart = Date.now();
            let success = false;
            let errorMessage = null;
            let scanCount = 0;
            let enrichCount = 0;
            let missingCount = 0;

            try {
                // a) Scan Gmail for new emails (stores raw + classifies)
                const scanResults = await EmailProcessor.processMessages(conn.id, undefined, supabase);
                scanCount = scanResults.length;

                // b) Match reservation facts to unenriched bookings
                const enrichResult = await EmailProcessor.enrichBookings(conn.id, supabase);
                enrichCount = enrichResult.enriched;
                missingCount = enrichResult.missing;

                // c) Process guest messages into conversations + messages tables
                await MessageProcessor.processGuestMessages(conn.id, supabase);

                success = true;
            } catch (e: any) {
                errorMessage = e.message || 'Unknown error';
                console.error(`[Cron:Enrichment] Error for ${conn.id}:`, e.message);
            }

            // Always log when enrichment ran (Law 17)
            await supabase.from('gmail_sync_log').insert({
                workspace_id: conn.workspace_id,
                connection_id: conn.id,
                success,
                error_message: errorMessage,
                emails_scanned: scanCount,
                bookings_enriched: enrichCount,
                review_items_created: missingCount,
                duration_ms: Date.now() - connStart
            });

            results.push({
                connection_id: conn.id,
                success,
                scanned: scanCount,
                enriched: enrichCount,
                missing: missingCount,
                error: errorMessage
            });
        }

        const endEvent = {
            status: 'ok',
            unenriched_count: unenrichedCount,
            connections_processed: results.length,
            results,
            duration_ms: Date.now() - start
        };

        console.log('[Cron:Enrichment] Complete:', JSON.stringify(endEvent));
        return NextResponse.json(endEvent);
    } catch (error: any) {
        console.error('[Cron:Enrichment] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
