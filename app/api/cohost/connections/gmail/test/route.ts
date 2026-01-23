import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGoogleOAuthClient } from '@/lib/utils/google';
import { google } from 'googleapis';

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const connectionId = searchParams.get('id');

    if (!connectionId) {
        return NextResponse.json({ error: 'Missing connection id parameter' }, { status: 400 });
    }

    const supabase = await createClient();

    try {
        // 1. Fetch Connection Credentials
        const { data: connection, error } = await supabase
            .from('connections')
            .select('gmail_refresh_token, gmail_account_email, reservation_label')
            .eq('id', connectionId)
            .single();

        if (error || !connection) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        if (!connection.gmail_refresh_token) {
            return NextResponse.json({ error: 'Gmail not connected (no refresh token)' }, { status: 400 });
        }

        console.log(`[GmailTest] Testing connection ${connectionId} for ${connection.gmail_account_email}`);

        // 2. Setup Client & Refresh Token
        const oauth2Client = getGoogleOAuthClient();
        oauth2Client.setCredentials({
            refresh_token: connection.gmail_refresh_token
        });

        // 3. Call Gmail API (List Labels)
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // This call will auto-refresh the access token if needed via google-auth-library
        const labelsRes = await gmail.users.labels.list({
            userId: 'me'
        });

        const labels = labelsRes.data.labels || [];
        const labelName = connection.reservation_label || 'Airbnb'; // Default if not set

        // 4. Verify Configured Label
        const targetLabel = labels.find(l => l.name?.toLowerCase() === labelName.toLowerCase());

        if (!targetLabel) {
            return NextResponse.json({
                success: false,
                error: `Label "${labelName}" not found in Gmail account.`,
                details: {
                    connected_email: connection.gmail_account_email,
                    available_labels_count: labels.length
                }
            });
        }

        // 5. Get Message Count (Optional Check)
        const msgsRes = await gmail.users.messages.list({
            userId: 'me',
            q: `label:${labelName}`,
            maxResults: 1 // Just need to see if we can query
        });

        return NextResponse.json({
            success: true,
            email: connection.gmail_account_email,
            label_found: true,
            label_details: targetLabel,
            message_access: true,
            approx_total_messages: targetLabel.messagesTotal
        });

    } catch (err: any) {
        console.error('[GmailTest] Error:', err);
        // Handle Token Errors (Revoked)
        if (err.response?.data?.error === 'invalid_grant' || err.message?.includes('invalid_grant')) {
            return NextResponse.json({
                error: 'Gmail connection expired or revoked. Please reconnect.',
                code: 'TOKEN_REVOKED'
            }, { status: 401 });
        }

        return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
    }
}
