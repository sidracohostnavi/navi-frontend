import { NextRequest, NextResponse } from 'next/server';
import { getGoogleOAuthClient } from '@/lib/utils/google';
import { createClient } from '@/lib/supabase/server';
import { google } from 'googleapis';
import { GmailService } from '@/lib/services/gmail-service';

// Force dynamic since we read search params/cookies
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // This is connection_id
    const error = searchParams.get('error');

    if (error) {
        return NextResponse.redirect(new URL(`/cohost/settings/connections?error=gmail_auth_${error}`, req.url));
    }

    if (!code || !state) {
        return NextResponse.redirect(new URL('/cohost/settings/connections?error=missing_params', req.url));
    }

    const connectionId = state;
    const supabase = await createClient();
    const oauth2Client = getGoogleOAuthClient();

    try {
        // 1. Exchange Code for Tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // 2. Get User Info (Email)
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const email = userInfo.data.email;

        if (!tokens.refresh_token) {
            console.warn('[GmailAuth] No refresh token returned. User might have not approved offline access or prompt was not consent.');
            // Note: If user re-auths without prompt='consent', Google might not send refresh token again. 
            // We added prompt='consent' in url route to mitigate this.
        }

        // 3. Update Connection
        const updates: any = {
            gmail_access_token: tokens.access_token,
            gmail_token_expires_at: tokens.expiry_date,
            gmail_account_email: email,
            gmail_scopes: typeof tokens.scope === 'string' ? tokens.scope.split(' ') : [],
            gmail_connected_at: new Date().toISOString()
        };

        // Only update refresh token if new one provided
        if (tokens.refresh_token) {
            updates.gmail_refresh_token = tokens.refresh_token;
        }

        const { error: dbError } = await supabase
            .from('connections')
            .update(updates)
            .eq('id', connectionId);

        if (dbError) {
            throw new Error('Database update failed: ' + dbError.message);
        }

        // 4. STRICT VERIFICATION
        // Now that tokens are saved, run the verification logic immediately.
        // This sets 'gmail_status' to 'connected' OR 'error'.
        const verifyResult = await GmailService.verifyConnection(connectionId);

        // 5. Redirect based on verification result
        if (verifyResult.success) {
            return NextResponse.redirect(new URL('/cohost/settings/connections?success=gmail_connected', req.url));
        } else {
            return NextResponse.redirect(new URL(`/cohost/settings/connections?error=verification_failed&details=${encodeURIComponent(verifyResult.error || 'Unknown error')}`, req.url));
        }

    } catch (err: any) {
        console.error('Gmail Auth Callback Error:', err);
        return NextResponse.redirect(new URL(`/cohost/settings/connections?error=${encodeURIComponent(err.message)}`, req.url));
    }
}
