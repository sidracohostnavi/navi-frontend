import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EmailProcessor } from '@/lib/services/email-processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow 60s for full sync

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: connectionId } = await params;
    const supabase = await createClient();

    try {
        console.log(`[Sync] Starting full sync for connection ${connectionId}`);

        // 1. Authenticate
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Fetch connection to verify ownership
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('*')
            .eq('id', connectionId)
            .eq('user_id', user.id)
            .single();

        if (connError || !connection) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        if (!connection.gmail_refresh_token && !connection.gmail_access_token) {
            return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 });
        }

        // 3. STEP 1: Fetch & Parse New Emails
        // This will fetch from Gmail, store in gmail_messages, and populate reservation_facts
        console.log(`[Sync] Step 1: Processing Messages...`);
        const scanResults = await EmailProcessor.processMessages(connectionId);

        // 4. STEP 2: Enrich & Reconcile Bookings
        // This uses the facts to update iCal bookings and create review items
        console.log(`[Sync] Step 2: Enriching Bookings...`);
        const enrichmentResults = await EmailProcessor.enrichBookings(connectionId);

        // 5. Update Last Synced Timestamp
        await supabase
            .from('connections')
            .update({
                gmail_last_verified_at: new Date().toISOString(),
                gmail_status: 'connected', // Ensure status is healthy
                gmail_last_error_message: null
            })
            .eq('id', connectionId);

        // 6. Return Combined Stats
        return NextResponse.json({
            success: true,
            stats: {
                emails_scanned: scanResults.length, // Newly parsed facts
                bookings_enriched: enrichmentResults.enriched,
                review_items_created: enrichmentResults.missing
            },
            message: `Sync Complete: ${scanResults.length} new emails processed, ${enrichmentResults.enriched} bookings enriched.`
        });

    } catch (err: any) {
        console.error('[Sync] Error:', err);

        // Update connection status to error if it was a real failure (not just partial)
        // But maybe we don't want to break the whole connection on temporary sync fail?
        // Let's safe-guard: if it's an auth error or API error, maybe mark error.

        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
