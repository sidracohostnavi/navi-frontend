// Microsoft OAuth callback.
// Exchanges the authorization code for tokens, fetches the account email,
// stores everything on the connections row, and sets email_provider = 'microsoft'.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createStandardClient } from '@/lib/supabase/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { ensureWorkspace } from '@/lib/workspaces/ensureWorkspace';
import { exchangeMicrosoftCode, getMicrosoftUserEmail } from '@/lib/utils/microsoft';

export const dynamic = 'force-dynamic';

const BASE_REDIRECT = '/cohost/settings/connections';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state') || '';
    const errorParam = searchParams.get('error');
    const errorDesc = searchParams.get('error_description');

    // Decode state
    let connectionId: string;
    let returnTo: string | null = null;
    try {
        const parsed = JSON.parse(stateParam);
        connectionId = parsed.connection_id || stateParam;
        returnTo = parsed.return_to || null;
    } catch {
        connectionId = stateParam;
    }

    if (errorParam) {
        console.error('[MicrosoftCallback] OAuth error:', errorParam, errorDesc);
        return NextResponse.redirect(
            new URL(`${BASE_REDIRECT}?result=error&message=${encodeURIComponent(errorDesc || errorParam)}`, request.url)
        );
    }

    if (!code || !connectionId) {
        return NextResponse.redirect(
            new URL(`${BASE_REDIRECT}?result=error&message=missing_params`, request.url)
        );
    }

    // 1. Auth + workspace verification
    let workspaceId: string;
    try {
        const supabase = await createStandardClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
            return NextResponse.redirect(
                new URL(`${BASE_REDIRECT}?result=error&message=unauthorized`, request.url)
            );
        }

        const wsId = await ensureWorkspace(user.id);
        if (!wsId) {
            return NextResponse.redirect(
                new URL(`${BASE_REDIRECT}?result=error&message=no_active_workspace`, request.url)
            );
        }
        workspaceId = wsId;

        const { data: conn } = await supabase
            .from('connections')
            .select('workspace_id')
            .eq('id', connectionId)
            .single();

        if (!conn || conn.workspace_id !== workspaceId) {
            return NextResponse.redirect(
                new URL(`${BASE_REDIRECT}?result=error&message=connection_not_visible`, request.url)
            );
        }
    } catch (err: any) {
        return NextResponse.redirect(
            new URL(`${BASE_REDIRECT}?result=error&message=security_check_failed`, request.url)
        );
    }

    // 2. Exchange code for tokens
    const admin = createCohostServiceClient();
    try {
        const tokens = await exchangeMicrosoftCode(code);

        // Fetch the account's email address
        const accountEmail = await getMicrosoftUserEmail(tokens.access_token);
        const expiresAt = Date.now() + tokens.expires_in * 1000;

        // Check if connection already has a Microsoft account email — enforce same-account rule
        const { data: existingConn } = await admin
            .from('connections')
            .select('microsoft_account_email, name')
            .eq('id', connectionId)
            .single();

        if (
            existingConn?.microsoft_account_email &&
            existingConn.microsoft_account_email !== accountEmail
        ) {
            const msg = `Wrong Microsoft account. This connection is tied to ${existingConn.microsoft_account_email}.`;
            return NextResponse.redirect(
                new URL(`${BASE_REDIRECT}?result=error&message=${encodeURIComponent(msg)}`, request.url)
            );
        }

        await admin.from('connections').update({
            email_provider: 'microsoft',
            microsoft_access_token: tokens.access_token,
            microsoft_refresh_token: tokens.refresh_token,
            microsoft_token_expires_at: expiresAt,
            microsoft_account_email: accountEmail,
            microsoft_status: 'connected',
            // Clear any stale SMTP credentials to avoid confusion
            smtp_status: null,
        }).eq('id', connectionId);

        console.log(`[MicrosoftCallback] ✅ Connected ${accountEmail} to connection ${connectionId}`);

        // Propagate tokens to sibling connections with the same Microsoft email
        await admin.from('connections').update({
            email_provider: 'microsoft',
            microsoft_access_token: tokens.access_token,
            microsoft_refresh_token: tokens.refresh_token,
            microsoft_token_expires_at: expiresAt,
            microsoft_account_email: accountEmail,
            microsoft_status: 'connected',
        })
            .eq('workspace_id', workspaceId)
            .eq('microsoft_account_email', accountEmail)
            .neq('id', connectionId);

        const successUrl = returnTo === 'onboarding'
            ? `/cohost/onboarding?microsoft=success&connection_id=${connectionId}`
            : `${BASE_REDIRECT}?result=success&connection_id=${connectionId}&provider=microsoft`;

        return NextResponse.redirect(new URL(successUrl, request.url));

    } catch (err: any) {
        console.error('[MicrosoftCallback] Token exchange failed:', err.message);
        return NextResponse.redirect(
            new URL(`${BASE_REDIRECT}?result=error&message=${encodeURIComponent(err.message)}`, request.url)
        );
    }
}
