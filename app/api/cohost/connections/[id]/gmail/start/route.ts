import { NextRequest, NextResponse } from 'next/server';
import { getGoogleOAuthClient } from '@/lib/utils/google';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> } // Params is a Promise in Next.js 15+
) {
    try {
        const { id } = await params;
        const oauth2Client = getGoogleOAuthClient();

        // Generate Auth URL
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

        return NextResponse.redirect(url);
    } catch (err: any) {
        console.error('[GmailAuthStart] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
