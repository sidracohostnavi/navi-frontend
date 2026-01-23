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
        // Fetch connection
        const { data: connection, error: dbError } = await supabase
            .from('connections')
            .select('gmail_refresh_token, gmail_access_token')
            .eq('id', id)
            .single();

        if (dbError || !connection) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        if (!connection.gmail_refresh_token && !connection.gmail_access_token) {
            return NextResponse.json({ error: 'No Gmail tokens available. Please connect Gmail first.' }, { status: 400 });
        }

        // Setup OAuth client
        const oauth2Client = getGoogleOAuthClient();
        const creds: any = {};
        if (connection.gmail_refresh_token) creds.refresh_token = connection.gmail_refresh_token;
        if (connection.gmail_access_token) creds.access_token = connection.gmail_access_token;
        oauth2Client.setCredentials(creds);

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Fetch labels
        const labelsRes = await gmail.users.labels.list({ userId: 'me' });
        const labels = labelsRes.data.labels || [];

        // Filter to user-created labels and common ones
        const userLabels = labels
            .filter(l => l.type === 'user' || ['INBOX', 'SENT', 'SPAM', 'TRASH'].includes(l.id || ''))
            .map(l => ({
                id: l.id,
                name: l.name
            }))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        return NextResponse.json({ labels: userLabels });

    } catch (err: any) {
        console.error('[GmailLabels] Error:', err);
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
        const { label_name } = body;

        if (!label_name) {
            return NextResponse.json({ error: 'label_name is required' }, { status: 400 });
        }

        // Update connection with selected label
        const { error: updateError } = await supabase
            .from('connections')
            .update({ reservation_label: label_name })
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
