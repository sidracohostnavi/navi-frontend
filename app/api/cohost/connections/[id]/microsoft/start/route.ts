// Starts the Microsoft OAuth flow for a connection.
// Redirects the host to Microsoft's consent screen.
// On return, the callback at /api/cohost/connections/microsoft/callback
// stores the tokens and sets email_provider = 'microsoft'.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureWorkspace } from '@/lib/workspaces/ensureWorkspace';
import { getMicrosoftAuthUrl } from '@/lib/utils/microsoft';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workspaceId = await ensureWorkspace(user.id);
        if (!workspaceId) {
            return NextResponse.json({ error: 'No active workspace' }, { status: 403 });
        }

        // Verify connection belongs to this workspace
        const { data: connection } = await supabase
            .from('connections')
            .select('id, workspace_id')
            .eq('id', id)
            .single();

        if (!connection || connection.workspace_id !== workspaceId) {
            // Diagnostic fallback
            const admin = createCohostServiceClient();
            const { data: adminConn } = await admin.from('connections').select('workspace_id').eq('id', id).single();
            return NextResponse.json({
                error: adminConn
                    ? 'Connection exists but is not visible in your active workspace'
                    : 'Connection not found',
            }, { status: adminConn ? 403 : 404 });
        }

        // Encode state: connection_id + optional return_to
        const returnTo = request.nextUrl.searchParams.get('return_to');
        const state = returnTo
            ? JSON.stringify({ connection_id: id, return_to: returnTo })
            : id;

        const authUrl = getMicrosoftAuthUrl(state);
        return NextResponse.redirect(authUrl);

    } catch (err: any) {
        console.error('[MicrosoftOAuth.start]', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
