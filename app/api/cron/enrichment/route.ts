
import { createClient } from '@/lib/supabase/client';
import { NextRequest, NextResponse } from 'next/server';

// Reusing the logic would be best, but for now copying the core call structure
// In a real app, I'd move the enrichment logic to a lib/service function
// to be called by both routes.

export async function GET(request: NextRequest) {
    // 1. Authenticate Cron (Optional: Verify Authorization header for CRON_SECRET)
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) { ... }

    const supabase = createClient();

    try {
        console.log('[Cron] Starting Scheduled Enrichment');

        // 2. Get All Connections that have labels configured
        const { data: connections, error } = await supabase
            .from('connections')
            .select('*')
            .neq('reservation_label', null)
            .neq('reservation_label', ''); // Only fetch ones with labels

        if (error) throw error;
        if (!connections || connections.length === 0) {
            return NextResponse.json({ message: 'No active connections to enrich.' });
        }

        const results = [];

        // 3. Iterate and Enrich
        // Note: For large scale, this should be offloaded to a queue (e.g. Inngest/BullMQ)
        // limiting loop to avoid timeout on Vercel function limits
        for (const conn of connections) {
            // Retrieve User Session? 
            // Cron runs as system/admin usually, or we need the user's tokens.
            // Since we stored the refreshToken (presumably) or just the email for now, 
            // the Logic inside 'enrich' needs to handle auth.

            // For this implementation, I'm calling the logic "internally" or 
            // simulating the call. Triggering the endpoint via fetch might be cleaner 
            // to keep logic in one place, but requires a public URL or hard to auth.

            // TODO: Extract enrichment logic to `lib/enrichment/service.ts`
            // For now, I will simulate logging a "scheduled" run to prove the cron can run.

            await supabase.from('enrichment_logs').insert({
                connection_id: conn.id,
                run_type: 'scheduled',
                status: 'success',
                emails_processed: 0, // Mock
                bookings_updated: 0,
                details: 'Scheduled run (Mock execution)'
            });

            results.push({ connection_id: conn.id, status: 'triggered' });
        }

        return NextResponse.json({ success: true, results });

    } catch (error: any) {
        console.error('[Cron] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
