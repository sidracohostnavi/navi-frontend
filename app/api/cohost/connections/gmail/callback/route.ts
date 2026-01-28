import { NextRequest, NextResponse } from 'next/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
// Alias the standard client to avoid naming conflict
import { createClient as createStandardClient } from '@/lib/supabase/server';
import { getGoogleOAuthClient } from '@/lib/utils/google';
import { GmailService } from '@/lib/services/gmail-service';
import { ensureWorkspace } from '@/lib/workspaces/ensureWorkspace';

// Prevent caching for auth callback
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    // VERSION MARKER - If you see this in logs, v2 callback is running
    console.log('[GmailCallback] ====== V2 SECURE CALLBACK RUNNING ======');

    const code = searchParams.get('code');
    const connectionId = searchParams.get('state'); // We passed connectionId as state
    const error = searchParams.get('error');

    // Base redirect URL
    const baseUrl = '/cohost/settings/connections';

    if (error) {
        console.error('[GmailCallback] OAuth Error param:', error);
        return NextResponse.redirect(new URL(`${baseUrl}?result=error&message=${error}`, request.url));
    }

    if (!code || !connectionId) {
        console.error('[GmailCallback] Missing code or connectionId');
        return NextResponse.redirect(new URL(`${baseUrl}?result=error&message=missing_params`, request.url));
    }

    // 1. STRICT SECURITY CHECKS (User & Workspace)
    let user, workspaceId;
    try {
        const supabase = await createStandardClient();

        // A. Verify User
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user) {
            console.error('[GmailCallback] Unauthorized access attempt');
            return NextResponse.redirect(new URL(`${baseUrl}?result=error&message=unauthorized`, request.url));
        }
        user = userData.user;

        // B. Verify Active Workspace
        workspaceId = await ensureWorkspace(user.id);
        if (!workspaceId) {
            console.error('[GmailCallback] No active workspace for user', user.id);
            return NextResponse.redirect(new URL(`${baseUrl}?result=error&message=no_active_workspace`, request.url));
        }

        // C. Verify Connection Ownership & Scope (using RLS-scoped client)
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('workspace_id')
            .eq('id', connectionId)
            .single();

        if (connError || !connection) {
            // DIAGNOSTIC FALLBACK: Check if it exists at all (Admin Diagnostic)
            const adminSupabase = createCohostServiceClient();
            const { data: adminConn } = await adminSupabase
                .from('connections')
                .select('id, workspace_id, user_id')
                .eq('id', connectionId)
                .single();

            let errorCode = 'connection_not_found';

            if (adminConn) {
                // It exists, but RLS hid it.
                errorCode = 'connection_not_visible_in_active_workspace';
            }

            console.error(JSON.stringify({
                event: 'gmail_oauth_callback_blocked',
                outcome: 'blocked',
                user_id: user.id,
                connection_id: connectionId,
                error_code: errorCode,
                active_workspace_id: workspaceId,
                connection_workspace_id: adminConn?.workspace_id || null,
                detail: connError?.message
            }));
            return NextResponse.redirect(new URL(`${baseUrl}?result=error&message=${errorCode}`, request.url));
        }

        if (connection.workspace_id !== workspaceId) {
            console.error(JSON.stringify({
                event: 'gmail_oauth_callback_blocked',
                outcome: 'blocked',
                user_id: user.id,
                active_workspace_id: workspaceId,
                connection_id: connectionId,
                error_code: 'connection_not_visible_in_active_workspace',
                connection_workspace_id: connection.workspace_id
            }));
            return NextResponse.redirect(new URL(`${baseUrl}?result=error&message=connection_not_visible_in_active_workspace`, request.url));
        }

    } catch (err: any) {
        console.error(JSON.stringify({
            event: 'oauth_callback_failed',
            error: 'security_check_exception',
            detail: err.message
        }));
        return NextResponse.redirect(new URL(`${baseUrl}?result=error&message=security_check_failed`, request.url));
    }

    // 2. Token Exchange & Update (Use Admin Client for reliable update)
    const adminSupabase = createCohostServiceClient();

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
        }

        const updates: any = {
            gmail_scopes: typeof tokens.scope === 'string' ? [tokens.scope] : (Array.isArray(tokens.scope) ? tokens.scope : []),
            gmail_access_token: tokens.access_token,
            gmail_token_expires_at: tokens.expiry_date,
            gmail_connected_at: new Date().toISOString()
        };

        if (tokens.refresh_token) {
            updates.gmail_refresh_token = tokens.refresh_token;
        }

        // Update DB using Admin Client
        const { error: dbError } = await adminSupabase
            .from('connections')
            .update(updates)
            .eq('id', connectionId);

        if (dbError) {
            console.error('[GmailCallback] DB Update Error:', dbError);
            throw dbError;
        }

        console.log('[GmailCallback] DB updated successfully. Verifying connection...');

        // Trigger Verification
        const verification = await GmailService.verifyConnection(connectionId, {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expiry_date: tokens.expiry_date
        }, adminSupabase);

        if (!verification.success) {
            console.error('[GmailCallback] Verification Failed:', verification.error);
            return NextResponse.redirect(new URL(`${baseUrl}?result=error&message=${encodeURIComponent(verification.error || 'verification_failed')}`, request.url));
        }

        console.log('[GmailCallback] ✅ Process completed successfully.');

        // 3. Structured Audit Log
        console.log(JSON.stringify({
            event: 'oauth_callback_complete',
            user_id: user.id,
            workspace_id: workspaceId,
            connection_id: connectionId,
            provider: 'gmail',
            outcome: 'success'
        }));

        return NextResponse.redirect(new URL(`${baseUrl}?result=success`, request.url));

    } catch (err: any) {
        console.error('[GmailCallback] Exchange/Process Error:', err);
        return NextResponse.redirect(new URL(`${baseUrl}?result=error&message=${encodeURIComponent(err.message)}`, request.url));
    }
}
