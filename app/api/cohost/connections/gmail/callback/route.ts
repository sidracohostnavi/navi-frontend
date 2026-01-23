import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGoogleOAuthClient } from '@/lib/utils/google';
import { GmailService } from '@/lib/services/gmail-service';

// Prevent caching for auth callback
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;

    const code = searchParams.get('code');
    const connectionId = searchParams.get('state'); // We passed connectionId as state
    const error = searchParams.get('error');

    // Base redirect URL
    const baseUrl = '/cohost/settings/connections';

    console.log(`[GmailCallback] Received callback for connection: ${connectionId}`);

    if (error) {
        console.error('[GmailCallback] OAuth Error param:', error);
        return NextResponse.redirect(new URL(`${baseUrl}?result=error&message=${error}`, request.url));
    }

    if (!code || !connectionId) {
        console.error('[GmailCallback] Missing code or connectionId');
        return NextResponse.redirect(new URL(`${baseUrl}?result=error&message=missing_params`, request.url));
    }

    try {
        const oauth2Client = getGoogleOAuthClient();

        console.log('[GmailCallback] Exchanging code for tokens...');
        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);

        console.log('[GmailCallback] Token Exchange Results:');
        console.log('  - Has Refresh Token:', !!tokens.refresh_token);
        console.log('  - Has Access Token:', !!tokens.access_token);
        console.log('  - Scopes Received:', tokens.scope);
        console.log('  - Expires At:', tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'N/A');

        if (!tokens.refresh_token && !tokens.access_token) {
            console.error('[GmailCallback] ERROR: No tokens returned from Google');
            throw new Error('No tokens returned from Google');
        }

        if (!tokens.refresh_token) {
            console.warn('[GmailCallback] WARNING: No refresh_token in response. This may happen if user previously authorized.');
            console.warn('[GmailCallback] To get a new refresh_token, user must revoke access at: https://myaccount.google.com/permissions');
        }

        const updates: any = {
            gmail_scopes: [tokens.scope], // Store as array? scope is string space separated
            gmail_access_token: tokens.access_token,
            gmail_token_expires_at: tokens.expiry_date,
            gmail_connected_at: new Date().toISOString()
        };

        if (tokens.refresh_token) {
            updates.gmail_refresh_token = tokens.refresh_token;
        } else {
            console.warn('[GmailCallback] WARNING: No refresh token returned. Relying on existing token if present.');
        }

        // Update DB
        const { error: dbError } = await supabase
            .from('connections')
            .update(updates)
            .eq('id', connectionId);

        if (dbError) {
            console.error('[GmailCallback] DB Update Error:', dbError);
            throw dbError;
        }

        console.log('[GmailCallback] DB updated successfully. Verifying connection...');

        // Trigger Verification (Pass tokens directly to avoid race/refetch)
        const verification = await GmailService.verifyConnection(connectionId, {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expiry_date: tokens.expiry_date
        });

        if (!verification.success) {
            console.error('[GmailCallback] Verification Failed:', verification.error);
            console.error('[GmailCallback] Verification Error Code:', verification.code);
            console.error('[GmailCallback] This usually means:');
            if (verification.error?.includes('Gmail API has not been used')) {
                console.error('  → Gmail API is not enabled in Google Cloud Console');
            } else if (verification.error?.includes('Label') && verification.error?.includes('not found')) {
                console.error('  → The configured Gmail label does not exist in the mailbox');
            } else if (verification.error?.includes('invalid_grant')) {
                console.error('  → OAuth tokens are invalid or revoked');
            }
            return NextResponse.redirect(new URL(`${baseUrl}?result=error&message=${encodeURIComponent(verification.error)}`, request.url));
        }

        console.log('[GmailCallback] ✅ Process completed successfully.');
        return NextResponse.redirect(new URL(`${baseUrl}?result=success`, request.url));

    } catch (err: any) {
        console.error('[GmailCallback] Exchange/Process Error:', err);
        return NextResponse.redirect(new URL(`${baseUrl}?result=error&message=${encodeURIComponent(err.message)}`, request.url));
    }
}
