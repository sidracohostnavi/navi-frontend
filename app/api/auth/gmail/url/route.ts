import { NextRequest, NextResponse } from 'next/server';
import { getGoogleOAuthClient } from '@/lib/utils/google';

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');

    if (!connectionId) {
        return NextResponse.json({ error: 'Missing connection_id' }, { status: 400 });
    }

    try {
        const oauth2Client = getGoogleOAuthClient();

        // Generate the url that will be used for execution
        const scopes = [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/userinfo.email', // To store account email
        ];

        const url = oauth2Client.generateAuthUrl({
            // 'online' (default) or 'offline' (gets refresh_token)
            access_type: 'offline',
            // If you only need one scope, you can pass it as a string
            scope: scopes,
            // State: Pass connectionId to link back in callback
            state: connectionId,
            // Enable incremental authorization. Recommended as a best practice.
            include_granted_scopes: true,
            // Prompt for consent to ensure we get refresh token even if re-connecting
            prompt: 'consent'
        });

        return NextResponse.json({ url });
    } catch (err: any) {
        console.error('OAuth URL Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
