
import { createServerSupabaseClient } from '@/lib/supabase/authServer';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            // Log the exit action
            // Using service role for audit log as usual
            const { createClient } = require('@supabase/supabase-js');
            const serviceClient = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );

            // We log the current active workspace that was being viewed, if any
            const cookieStore = await cookies();
            const currentTarget = cookieStore.get('active_workspace_id')?.value;

            if (currentTarget) {
                await serviceClient
                    .from('support_audit_logs')
                    .insert({
                        support_user_id: user.id,
                        target_workspace_id: currentTarget,
                        action: 'clear-workspace',
                        details: { timestamp: new Date().toISOString() }
                    });
            }
        }

        const cookieStore = await cookies();

        // Clear cookies
        cookieStore.delete('support_mode');
        cookieStore.delete('active_workspace_id');

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Support clear error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
