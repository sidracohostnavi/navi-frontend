// SMTP setup endpoint.
//
// POST — save SMTP credentials for a connection and verify they work.
// Body: { host, port, secure, user, password, provider, from_name }
//
// The password is AES-256-GCM encrypted before storage.
// Returns { success, error? } — UI shows error if verify fails.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { ensureWorkspace } from '@/lib/workspaces/ensureWorkspace';
import { encryptSmtpPassword } from '@/lib/services/email-crypto';
import { SmtpMailService, SMTP_PROVIDERS } from '@/lib/services/smtp-mail-service';

export async function POST(
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
        const { data: conn } = await supabase
            .from('connections')
            .select('id, workspace_id')
            .eq('id', id)
            .single();

        if (!conn || conn.workspace_id !== workspaceId) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        const body = await request.json();
        const { host, port, secure, user: smtpUser, password, provider, from_name } = body;

        if (!smtpUser || !password) {
            return NextResponse.json(
                { error: 'smtp user and password are required' },
                { status: 400 }
            );
        }

        // Auto-fill host/port from known provider if not provided
        let finalHost = host;
        let finalPort = port;
        let finalSecure = secure;

        if ((!finalHost || !finalPort) && provider && provider !== 'custom') {
            const defaults = SMTP_PROVIDERS[provider];
            if (defaults) {
                finalHost = finalHost || defaults.host;
                finalPort = finalPort || defaults.port;
                finalSecure = finalSecure ?? defaults.secure;
            }
        }

        if (!finalHost) {
            return NextResponse.json(
                { error: 'SMTP host is required (enter manually or select a known provider)' },
                { status: 400 }
            );
        }

        // Encrypt and save credentials
        const encrypted = encryptSmtpPassword(password);

        const admin = createCohostServiceClient();
        await admin.from('connections').update({
            email_provider: 'smtp',
            smtp_host: finalHost,
            smtp_port: finalPort || 587,
            smtp_secure: finalSecure ?? false,
            smtp_user: smtpUser,
            smtp_password_encrypted: encrypted,
            smtp_provider: provider || 'custom',
            smtp_from_name: from_name || smtpUser,
            smtp_status: 'connected', // will be overridden if verify fails
            // Clear Microsoft tokens so there's no ambiguity
            microsoft_status: null,
        }).eq('id', id);

        // Run a live connection test
        const { success, error: testError } = await SmtpMailService.testConnection(id, admin);

        if (!success) {
            // Save error status but still return 200 — the UI will show the error
            return NextResponse.json({
                success: false,
                error: `Credentials saved but SMTP verification failed: ${testError}. ` +
                    'Check your host/port/password and make sure the app password has SMTP access enabled.',
            });
        }

        console.log(`[smtp/setup] ✅ SMTP configured for connection ${id} (${smtpUser})`);
        return NextResponse.json({ success: true });

    } catch (err: any) {
        console.error('[smtp/setup] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// GET — return known provider presets so the UI can auto-fill
export async function GET() {
    return NextResponse.json({ providers: SMTP_PROVIDERS });
}
