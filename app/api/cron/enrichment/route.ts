import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { EmailProcessor } from '@/lib/services/email-processor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        console.log('[Cron:Enrichment] Starting scheduled enrichment');

        const { data: connections, error } = await supabase
            .from('connections')
            .select('id, workspace_id')
            .not('gmail_refresh_token', 'is', null);

        if (error) throw error;
        if (!connections || connections.length === 0) {
            return NextResponse.json({ message: 'No active connections.' });
        }

        const results = [];
        for (const conn of connections) {
            try {
                const enrichResult = await EmailProcessor.enrichBookings(conn.id);
                results.push({
                    connection_id: conn.id,
                    enriched: enrichResult.enriched,
                    missing: enrichResult.missing
                });
            } catch (e: any) {
                console.error(`[Cron:Enrichment] Error for ${conn.id}:`, e.message);
                results.push({ connection_id: conn.id, error: e.message });
            }
        }

        console.log('[Cron:Enrichment] Complete:', JSON.stringify(results));
        return NextResponse.json({ success: true, results });
    } catch (error: any) {
        console.error('[Cron:Enrichment] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
