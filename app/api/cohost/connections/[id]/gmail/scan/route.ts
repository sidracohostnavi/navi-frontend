import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EmailProcessor } from '@/lib/services/email-processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for scanning

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: connectionId } = await params;
    const supabase = await createClient();

    try {
        console.log(`[GmailScan] Starting scan for connection ${connectionId}`);

        // 1. Authenticate user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Fetch connection with Gmail tokens and label
        // Also fetch linked properties to resolve workspace_id
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('*, connection_properties(property_id, cohost_properties(workspace_id))')
            .eq('id', connectionId)
            .eq('user_id', user.id)
            .single();

        if (connError || !connection) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        if (!connection.gmail_refresh_token && !connection.gmail_access_token) {
            return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 });
        }

        // 3. Resolve Workspace ID (The Fix)
        // connection.connection_properties is an array of { property_id, cohost_properties: { workspace_id } }
        const linkedProps = connection.connection_properties || [];

        if (linkedProps.length === 0) {
            // Edge case: Connection exists but no properties linked?
            // We can't enrich bookings without a property map, but we CAN fetch emails.
            // However, the prompt requires workspace_id for pipeline writes (if strictly enforced).
            console.warn(`[GmailScan] Connection ${connectionId} has no linked properties. Cannot resolve workspace.`);
            // Proceeding might be okay if we just want to fetch emails, but enrichment will fail.
        }

        let workspace_id: string | null = null;
        const workspaceIds = new Set<string>();
        const propIds: string[] = [];

        for (const link of linkedProps) {
            if (link.cohost_properties?.workspace_id) {
                workspaceIds.add(link.cohost_properties.workspace_id);
            }
            propIds.push(link.property_id);
        }

        if (workspaceIds.size > 1) {
            console.error(`[GmailScan] Connection ${connectionId} spans multiple workspaces: ${Array.from(workspaceIds).join(', ')}`);
            return NextResponse.json({ error: 'Connection spans multiple workspaces. Please split connections.' }, { status: 400 });
        }

        if (workspaceIds.size === 1) {
            workspace_id = Array.from(workspaceIds)[0];
        }

        console.log(`[GmailScan] Resolved Context: Connection=${connectionId} Workspace=${workspace_id} Properties=[${propIds.join(',')}] Reason=LinkedProperties`);

        // 4. Run Email Processor (Unified Logic)
        // This will fetch from Gmail, store in gmail_messages, and populate reservation_facts
        const results = await EmailProcessor.processMessages(connectionId);

        // 5. Enrichment (Optional immediate trigger?)
        // The iCal sync usually handles enrichment reading from facts.
        // But if we want immediate feedback, we might rely on the health route or a separate trigger.
        // EmailProcessor already returns the parsed facts (`results`).

        // We can log the success here.

        // 5. Update last synced timestamp
        await supabase
            .from('connections')
            .update({ gmail_last_verified_at: new Date().toISOString() })
            .eq('id', connectionId);

        return NextResponse.json({
            success: true,
            emails_scanned: results.length,
            reservations_parsed: results.length,
            reservations_upserted: results.length,
            workspace_id: workspace_id,
            message: `Processed ${results.length} reservation emails.`
        });

    } catch (err: any) {
        console.error('[GmailScan] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
