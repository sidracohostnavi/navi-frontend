
import { createServerSupabaseClient } from '@/lib/supabase/authServer';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { workspace_id } = body;

        if (!workspace_id) {
            return NextResponse.json({ error: 'Missing workspace_id' }, { status: 400 });
        }

        const supabase = await createServerSupabaseClient();

        // 1. Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user || !user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Check Allowlist
        const allowedEmails = (process.env.DEV_SUPPORT_EMAILS || '')
            .split(',')
            .map(e => e.trim().toLowerCase());

        if (!allowedEmails.includes(user.email.toLowerCase())) {
            console.warn(`Unauthorized support access attempt by ${user.email}`);
            return NextResponse.json({ error: 'Forbidden: NOT authorized for support mode' }, { status: 403 });
        }

        // 3. Verify Workspace Exists
        // We use service role to check existence since the dev might not have access yet
        const adminClient = await createServerSupabaseClient(); // Assuming this is authenticated as user, wait.
        // We need admin/service role to check if workspace exists if RLS blocks us.
        // But `authServer` usually uses Anon key + user token.
        // Let's create a service role client for the check and audit log.

        const { createClient } = require('@supabase/supabase-js');
        const serviceClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: workspace, error: wsError } = await serviceClient
            .from('cohost_workspaces')
            .select('id')
            .eq('id', workspace_id)
            .single();

        if (wsError || !workspace) {
            return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
        }

        // 4. Audit Log
        const { error: auditError } = await serviceClient
            .from('support_audit_logs')
            .insert({
                support_user_id: user.id,
                target_workspace_id: workspace_id,
                action: 'switch-workspace',
                details: { timestamp: new Date().toISOString() }
            });

        if (auditError) {
            console.error('Failed to log support access:', auditError);
            return NextResponse.json({ error: 'Audit log failed' }, { status: 500 });
        }

        // 5. Set Cookies
        const cookieStore = await cookies();
        // 24 hour expiry
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        cookieStore.set('support_mode', 'true', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            expires
        });

        cookieStore.set('active_workspace_id', workspace_id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            expires
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Support switch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
