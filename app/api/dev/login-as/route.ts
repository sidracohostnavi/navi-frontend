import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // Safety check: Dev only
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
        return NextResponse.json({ error: 'Missing email param' }, { status: 400 });
    }

    try {
        // Use service role key to generate magic link
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: {
                redirectTo: 'http://localhost:3000/cohost/dashboard'
            }
        });

        if (error) throw error;
        if (!data.properties?.action_link) throw new Error('No link generated');

        // Redirect immediately to the magic link
        return NextResponse.redirect(data.properties.action_link);

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
