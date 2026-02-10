import { NextRequest, NextResponse } from 'next/server';
import { getGoogleOAuthClient } from '@/lib/utils/google';
import { createClient } from '@/lib/supabase/server';
import { ensureWorkspace } from '@/lib/workspaces/ensureWorkspace';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // 1. Authenticate User
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Enforce Active Workspace
        const workspaceId = await ensureWorkspace(user.id);

        // Entry Log
        console.log(JSON.stringify({
            event: 'gmail_oauth_start_attempt',
            connection_id: id,
            auth_user_id: user.id,
            active_workspace_id: workspaceId || 'none'
        }));

        if (!workspaceId) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 403 });
        }

        // 3. Verify Connection Ownership & Workspace Scope
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('id, workspace_id, reservation_label')
            .eq('id', id)
            .single();

        if (connError || !connection) {
            // DIAGNOSTIC FALLBACK: Check if it exists at all (Admin Diagnostic)
            const adminSupabase = createCohostServiceClient();
            const { data: adminConn } = await adminSupabase
                .from('connections')
                .select('id, workspace_id, user_id')
                .eq('id', id)
                .single();

            let errorCode = 'CONNECTION_ID_NOT_FOUND';
            let errorMsg = 'Connection ID does not exist';
            let status = 404;

            if (adminConn) {
                // It exists, but RLS hid it.
                // Diagnosis: The connection belongs to workspace X, but user is active in workspace Y.
                errorCode = 'CONNECTION_NOT_VISIBLE_IN_ACTIVE_WORKSPACE';
                errorMsg = 'Connection exists but is not visible in your active workspace scope';
                status = 403;
            }

            console.error(JSON.stringify({
                event: 'oauth_start_failed',
                outcome: 'blocked',
                user_id: user.id,
                auth_user_id: user.id, // prompt requested redundant field
                active_workspace_id: workspaceId,
                connection_id: id,
                error_code: errorCode,
                connection_workspace_id: adminConn?.workspace_id || null, // diagnostic
                detail: connError?.message
            }));

            return NextResponse.json({ error: errorMsg, code: errorCode }, { status });
        }

        if (connection.workspace_id !== workspaceId) {
            console.error(JSON.stringify({
                event: 'oauth_start_failed',
                outcome: 'blocked',
                user_id: user.id,
                active_workspace_id: workspaceId,
                connection_id: id,
                error_code: 'CONNECTION_NOT_VISIBLE_IN_ACTIVE_WORKSPACE',
                connection_workspace_id: connection.workspace_id
            }));
            return NextResponse.json({
                error: 'Connection exists but is not visible in your active workspace scope',
                code: 'CONNECTION_NOT_VISIBLE_IN_ACTIVE_WORKSPACE'
            }, { status: 403 });
        }

        // 3.1 Label Check Removed
        // Previously required reservation_label BEFORE OAuth, but that's backwards.
        // Labels are Gmail-account-specific, so user must authenticate first, THEN select label.
        // Label selection now happens in post-auth "Configure Gmail Label" step.

        console.log(JSON.stringify({
            event: 'gmail_eligibility_check',
            connection_id: id,
            is_eligible: true,
            note: 'Label selection happens post-OAuth'
        }));

        // 4. Generate Auth URL
        const oauth2Client = getGoogleOAuthClient();

        // We pass the connection ID as 'state' so we know which connection to update on callback
        const scopes = [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/userinfo.email'
        ];

        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline', // Essential for refresh token
            scope: scopes,
            state: id,
            prompt: 'consent' // Force full consent to ensure refresh token is returned
        });

        console.log(JSON.stringify({
            event: 'gmail_oauth_start_result',
            outcome: 'success',
            connection_id: id
        }));

        return NextResponse.redirect(url);
    } catch (err: any) {
        console.error('[GmailAuthStart] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
