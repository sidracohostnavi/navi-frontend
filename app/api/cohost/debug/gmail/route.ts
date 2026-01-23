import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGoogleOAuthClient } from '@/lib/utils/google';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const connectionId = request.nextUrl.searchParams.get('connectionId');

    if (!connectionId) {
        return NextResponse.json({ error: 'Missing connectionId parameter' }, { status: 400 });
    }

    const supabase = await createClient();

    try {
        // 1. Load connection from DB
        const { data: connection, error: dbError } = await supabase
            .from('connections')
            .select('*')
            .eq('id', connectionId)
            .single();

        if (dbError || !connection) {
            return NextResponse.json({
                error: 'Connection not found',
                details: dbError?.message
            }, { status: 404 });
        }

        // 2. Build basic response
        const now = Date.now();
        const expiresAt = connection.gmail_token_expires_at;
        const expiresInSeconds = expiresAt ? Math.floor((expiresAt - now) / 1000) : null;

        const response: any = {
            connection_id: connectionId,
            gmail_status: connection.gmail_status,
            gmail_account_email: connection.gmail_account_email,
            has_access_token: !!connection.gmail_access_token,
            has_refresh_token: !!connection.gmail_refresh_token,
            token_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
            expires_in_seconds: expiresInSeconds,
            token_expired: expiresInSeconds !== null && expiresInSeconds < 0,
            scopes: connection.gmail_scopes,
            last_error_code: connection.gmail_last_error_code,
            last_error_message: connection.gmail_last_error_message,
            last_verified_at: connection.gmail_last_verified_at,
            gmail_api_tests: {}
        };

        // 3. If no tokens, return early
        if (!connection.gmail_access_token && !connection.gmail_refresh_token) {
            response.gmail_api_tests.error = 'No tokens available';
            return NextResponse.json(response);
        }

        // 4. Setup OAuth client
        const oauth2Client = getGoogleOAuthClient();
        const credentials: any = {};

        if (connection.gmail_refresh_token) {
            credentials.refresh_token = connection.gmail_refresh_token;
        }
        if (connection.gmail_access_token) {
            credentials.access_token = connection.gmail_access_token;
        }
        if (expiresAt) {
            credentials.expiry_date = expiresAt;
        }

        oauth2Client.setCredentials(credentials);

        // 5. Test Gmail API - Profile
        try {
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            console.log('[GmailDebug] Testing users.getProfile...');
            const profileRes = await gmail.users.getProfile({ userId: 'me' });

            response.gmail_api_tests.profile = {
                success: true,
                email: profileRes.data.emailAddress,
                messages_total: profileRes.data.messagesTotal,
                threads_total: profileRes.data.threadsTotal
            };

            // Update account email if missing
            if (!connection.gmail_account_email && profileRes.data.emailAddress) {
                await supabase
                    .from('connections')
                    .update({ gmail_account_email: profileRes.data.emailAddress })
                    .eq('id', connectionId);

                response.gmail_account_email = profileRes.data.emailAddress;
            }

        } catch (profileErr: any) {
            console.error('[GmailDebug] Profile test failed:', profileErr.message);
            response.gmail_api_tests.profile = {
                success: false,
                error: profileErr.message,
                code: profileErr.code,
                status: profileErr.status
            };

            // If token expired and we have refresh token, try refreshing
            if (profileErr.message?.includes('invalid_grant') ||
                profileErr.message?.includes('Token has been expired') ||
                (expiresInSeconds !== null && expiresInSeconds < 0)) {

                if (connection.gmail_refresh_token) {
                    console.log('[GmailDebug] Token expired, attempting refresh...');

                    try {
                        const { credentials: newCreds } = await oauth2Client.refreshAccessToken();

                        // Update DB with new token
                        await supabase
                            .from('connections')
                            .update({
                                gmail_access_token: newCreds.access_token,
                                gmail_token_expires_at: newCreds.expiry_date
                            })
                            .eq('id', connectionId);

                        response.token_refreshed = true;
                        response.gmail_api_tests.profile.retry_after_refresh = 'Token refreshed, retry your request';

                    } catch (refreshErr: any) {
                        console.error('[GmailDebug] Token refresh failed:', refreshErr.message);
                        response.gmail_api_tests.profile.refresh_error = refreshErr.message;
                    }
                }
            }
        }

        // 6. Test Gmail API - Labels
        try {
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            console.log('[GmailDebug] Testing users.labels.list...');
            const labelsRes = await gmail.users.labels.list({ userId: 'me' });
            const labels = labelsRes.data.labels || [];

            const targetLabel = connection.reservation_label || 'Airbnb';
            const foundLabel = labels.find(l => l.name?.toLowerCase() === targetLabel.toLowerCase());

            response.gmail_api_tests.labels = {
                success: true,
                total_labels: labels.length,
                target_label: targetLabel,
                target_label_found: !!foundLabel,
                label_details: foundLabel || null,
                all_labels: labels.map(l => l.name)
            };

        } catch (labelsErr: any) {
            console.error('[GmailDebug] Labels test failed:', labelsErr.message);
            response.gmail_api_tests.labels = {
                success: false,
                error: labelsErr.message,
                code: labelsErr.code,
                status: labelsErr.status
            };
        }

        return NextResponse.json(response);

    } catch (err: any) {
        console.error('[GmailDebug] Unexpected error:', err);
        return NextResponse.json({
            error: 'Debug endpoint failed',
            message: err.message
        }, { status: 500 });
    }
}
