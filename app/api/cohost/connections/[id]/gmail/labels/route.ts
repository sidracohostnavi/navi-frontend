import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGoogleOAuthClient } from '@/lib/utils/google';
import { google } from 'googleapis';
import { GmailService } from '@/lib/services/gmail-service';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    try {
        // 1. Fetch connection and check if archived
        const { data: connection, error: dbError } = await supabase
            .from('connections')
            .select('gmail_refresh_token, gmail_access_token, gmail_token_expires_at, archived_at')
            .eq('id', id)
            .single();

        if (dbError || !connection) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        // Guard: don't allow archived connections
        if (connection.archived_at) {
            return NextResponse.json({ error: 'Connection is archived' }, { status: 400 });
        }

        if (!connection.gmail_refresh_token && !connection.gmail_access_token) {
            return NextResponse.json({ error: 'No Gmail tokens available. Please connect Gmail first.' }, { status: 400 });
        }

        // 2. Use the authenticated client helper (handles token refresh automatically)
        const clientResult = await GmailService.createAuthenticatedClient(id, supabase);

        if (!clientResult.success) {
            const status = clientResult.needsReconnect ? 401 : 500;
            return NextResponse.json({
                error: clientResult.error,
                code: clientResult.needsReconnect ? 'NEEDS_RECONNECT' : 'CLIENT_ERROR',
                needsReconnect: clientResult.needsReconnect
            }, { status });
        }

        // 3. Fetch labels
        const labelsRes = await clientResult.gmail.users.labels.list({ userId: 'me' });
        const labels = labelsRes.data.labels || [];

        // Filter to user-created labels and common ones
        const userLabels = labels
            .filter((l: any) => l.type === 'user' || ['INBOX', 'SENT', 'SPAM', 'TRASH'].includes(l.id || ''))
            .map((l: any) => ({
                id: l.id,
                name: l.name
            }))
            .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

        // 4. Record success
        await GmailService.recordSuccess(id, supabase);

        return NextResponse.json({ labels: userLabels });

    } catch (err: any) {
        console.error('[GmailLabels] Error:', err);

        // Check for token errors - these should trigger reconnect
        if (err.code === 401 || err.message?.includes('invalid_grant')) {
            // Attempt one token refresh
            const refreshResult = await GmailService.refreshAccessToken(id, supabase);
            if (refreshResult.success) {
                // Retry with refreshed client
                const retryResult = await GmailService.createAuthenticatedClient(id, supabase);
                if (retryResult.success) {
                    const retryLabels = await retryResult.gmail.users.labels.list({ userId: 'me' });
                    const labels = retryLabels.data.labels || [];
                    const userLabels = labels
                        .filter((l: any) => l.type === 'user' || ['INBOX', 'SENT', 'SPAM', 'TRASH'].includes(l.id || ''))
                        .map((l: any) => ({ id: l.id, name: l.name }))
                        .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

                    await GmailService.recordSuccess(id, supabase);
                    return NextResponse.json({ labels: userLabels });
                }
            }

            return NextResponse.json({
                error: 'Token expired and refresh failed. Please reconnect Gmail.',
                code: 'NEEDS_RECONNECT',
                needsReconnect: true
            }, { status: 401 });
        }

        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    try {
        const body = await request.json();
        const { label_name, label_id } = body;

        if (!label_name || !label_id) {
            return NextResponse.json({ error: 'label_name and label_id are required' }, { status: 400 });
        }

        // Update connection with selected label (new columns + legacy for backward compat)
        const { error: updateError } = await supabase
            .from('connections')
            .update({
                gmail_label_id: label_id,
                gmail_label_name: label_name,
                reservation_label: label_name  // backward compatibility
            })
            .eq('id', id);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Re-verify connection with new label
        const verification = await GmailService.verifyConnection(id);

        return NextResponse.json({
            success: true,
            label_name,
            verification
        });

    } catch (err: any) {
        console.error('[GmailLabels] POST Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
