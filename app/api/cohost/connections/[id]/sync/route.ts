import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EmailProcessor } from '@/lib/services/email-processor';
import { handleError, AppError } from '@/lib/utils/api-errors';
import { acquireSyncLock, releaseSyncLock } from '@/lib/utils/sync-lock';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow 60s for full sync

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: connectionId } = await params;
    const supabase = await createClient();

    // 0. BLAST RADIUS CONTROL: In-Memory Concurrency Lock
    const hasLock = acquireSyncLock(connectionId);

    // Check lock BEFORE try block to avoid releasing what we didn't acquire if we fail early
    // But we need to respond with JSON.
    // Ideally we throw AppError and let catch handle it, but catch needs `hasLock` context for finally.
    // It's cleaner to check lock inside try/finally if possible, OR just handle rejection early.

    if (!hasLock) {
        // Return 409 immediately
        const { status, response } = handleError(new AppError(
            'Sync already in progress for this connection.',
            'SYNC_IN_PROGRESS',
            409,
            'Please wait a moment before trying again.'
        ), { connection_id: connectionId });
        return NextResponse.json(response, { status });
    }

    const start = Date.now();

    try {
        console.log(`[Sync] Starting full sync for connection ${connectionId}`);

        // 1. Authenticate
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            throw new AppError('Unauthorized', 'UNAUTHORIZED', 401);
        }

        // 2. Fetch connection to verify ownership
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('*')
            .eq('id', connectionId)
            .eq('user_id', user.id)
            .single();

        if (connError || !connection) {
            throw new AppError('Connection not found', 'CONNECTION_NOT_FOUND', 404);
        }

        // Structured Start Log
        console.log(JSON.stringify({
            event: 'sync_run_start',
            workspace_id: connection.workspace_id,
            connection_id: connectionId,
            provider: 'gmail'
        }));

        if (!connection.gmail_refresh_token && !connection.gmail_access_token) {
            throw new AppError('Gmail not connected', 'GMAIL_NOT_CONNECTED', 400);
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
        const responseData = {
            success: true,
            stats: {
                emails_scanned: scanResults.length, // Newly parsed facts
                bookings_enriched: enrichmentResults.enriched,
                review_items_created: enrichmentResults.missing
            },
            message: `Sync Complete: ${scanResults.length} new emails processed, ${enrichmentResults.enriched} bookings enriched.`
        };

        // Structured End Log (Success)
        console.log(JSON.stringify({
            event: 'sync_run_end',
            workspace_id: connection.workspace_id,
            connection_id: connectionId,
            outcome: 'success',
            duration_ms: Date.now() - start,
            stats: responseData.stats
        }));

        return NextResponse.json(responseData);

    } catch (err: any) {
        console.error('[Sync] Error:', err);

        // Structured End Log (Failure)
        console.error(JSON.stringify({
            event: 'sync_run_end',
            connection_id: connectionId,
            outcome: 'error',
            duration_ms: Date.now() - start,
            error_code: err instanceof AppError ? err.code : 'UNKNOWN'
        }));

        // Use standardized error handler
        const { status, response } = handleError(err, { connection_id: connectionId });

        return NextResponse.json(response, { status });
    } finally {
        // ALWAYS release lock if we acquired it
        releaseSyncLock(connectionId);
    }
}
