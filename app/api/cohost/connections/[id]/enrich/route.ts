import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { EmailProcessor } from '@/lib/services/email-processor';

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    const connectionId = params.id;
    const supabase = await createClient();

    try {
        // 1. Validate Connection & Status
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('gmail_status, reservation_label')
            .eq('id', connectionId)
            .single();

        if (connError || !connection) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        if (connection.gmail_status !== 'connected') {
            console.error(`[Enrich] Gmail not connected for ${connectionId}, status: ${connection.gmail_status}`);
            return NextResponse.json({
                error: 'Gmail is not connected or verified. Please connect Gmail in settings first.',
                stage: 'oauth',
                gmail_status: connection.gmail_status
            }, { status: 400 });
        }

        const labelUsed = connection.reservation_label || 'Not configured';
        console.log(`[Enrich] Starting enrichment for ${connectionId}`);
        console.log(`[Enrich] Label: ${labelUsed}`);

        // 2. Process emails
        const results = await EmailProcessor.processMessages(connectionId);
        const processedCount = results.length;

        // 3. Enrich Calendar (Re-hydration & Missing Detection)
        const enrichmentResult = await EmailProcessor.enrichBookings(connectionId);
        console.log(`[Enrich] Enriched ${enrichmentResult.enriched} bookings. Missing detected: ${enrichmentResult.missing}`);

        // 4. Log run
        await supabase.from('enrichment_logs').insert({
            connection_id: connectionId,
            run_type: 'manual',
            status: processedCount > 0 || enrichmentResult.enriched > 0 ? 'success' : 'no_results',
            emails_processed: processedCount,
            details: `Label: ${labelUsed}. Parsed: ${processedCount}, Enriched: ${enrichmentResult.enriched}, Missing: ${enrichmentResult.missing}`
        });

        return NextResponse.json({
            success: true,
            labelUsed,
            processed: processedCount,
            enriched: enrichmentResult.enriched,
            missing_detected: enrichmentResult.missing,
            message: `Processed ${processedCount} emails. Enriched ${enrichmentResult.enriched} bookings. Detected ${enrichmentResult.missing} missing.`
        });

    } catch (error: any) {
        console.error('[Enrich] Error:', error);

        await supabase.from('enrichment_logs').insert({
            connection_id: connectionId,
            run_type: 'manual',
            status: 'error',
            details: error.message
        });

        return NextResponse.json({
            error: error.message,
            stage: 'processing'
        }, { status: 500 });
    }
}
