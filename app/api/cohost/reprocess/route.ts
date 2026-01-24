import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { EmailProcessor } from '@/lib/services/email-processor';

/**
 * POST /api/cohost/reprocess
 * 
 * Reprocess stored Gmail messages and route to Review items.
 * SAFETY:
 * - Does NOT refetch Gmail
 * - Does NOT create bookings
 * - Only creates enrichment_review_items for unmatched reservations
 * - Safe to run repeatedly (idempotent)
 */
export async function POST() {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user's workspace
        const { data: membership } = await supabase
            .from('cohost_workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

        if (!membership?.workspace_id) {
            return NextResponse.json({
                success: true,
                message: 'No workspace found',
                processed: 0,
                reviewItems: 0
            });
        }

        // Get all connections for this workspace
        const { data: connections } = await supabase
            .from('connections')
            .select('id')
            .eq('workspace_id', membership.workspace_id);

        if (!connections || connections.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No connections found',
                processed: 0,
                reviewItems: 0
            });
        }

        // Run reprocess for each connection
        let totalMessagesScanned = 0;
        let totalReservationsParsed = 0;
        let totalReviewItemsCreated = 0;
        let totalReviewItemsSkipped = 0;

        for (const conn of connections) {
            try {
                const result = await EmailProcessor.reprocessGmailToReview(conn.id);
                totalMessagesScanned += result.messages_scanned;
                totalReservationsParsed += result.reservations_parsed;
                totalReviewItemsCreated += result.review_items_created;
                totalReviewItemsSkipped += result.review_items_skipped;
            } catch (err) {
                console.error(`[Reprocess] Error for connection ${conn.id}:`, err);
            }
        }

        console.log(`[Reprocess] Complete: Scanned=${totalMessagesScanned}, Parsed=${totalReservationsParsed}, Created=${totalReviewItemsCreated}, Skipped=${totalReviewItemsSkipped}`);

        return NextResponse.json({
            success: true,
            messages_scanned: totalMessagesScanned,
            reservations_parsed: totalReservationsParsed,
            review_items_created: totalReviewItemsCreated,
            review_items_skipped: totalReviewItemsSkipped,
            connections_processed: connections.length
        });

    } catch (err: any) {
        console.error('[Reprocess] Error:', err);
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
