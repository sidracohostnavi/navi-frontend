// Microsoft Identity Platform (OAuth 2.0) helpers
// Used for connecting Outlook / Hotmail / Office 365 accounts.
//
// Scopes requested:
//   openid email profile         — identity
//   offline_access               — refresh tokens
//   Mail.Read                    — read inbox for relay email ingest
//   Mail.Send                    — send replies

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';

const SCOPES = [
    'openid',
    'email',
    'profile',
    'offline_access',
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.Send',
].join(' ');

function getConfig() {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/cohost/connections/microsoft/callback`;

    if (!clientId || !clientSecret) {
        throw new Error('Missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET env variables');
    }

    return { clientId, clientSecret, redirectUri };
}

/**
 * Build the Microsoft OAuth authorization URL.
 * Pass the connection ID as `state` so the callback knows which connection to update.
 */
export function getMicrosoftAuthUrl(state: string): string {
    const { clientId, redirectUri } = getConfig();
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: SCOPES,
        state,
        prompt: 'consent', // Always show consent screen so we get a fresh refresh token
        response_mode: 'query',
    });
    return `${AUTHORITY}/authorize?${params.toString()}`;
}

export type MicrosoftTokenResponse = {
    access_token: string;
    refresh_token: string;
    expires_in: number;   // seconds
    token_type: string;
    scope: string;
};

/**
 * Exchange an authorization code for tokens (authorization_code grant).
 */
export async function exchangeMicrosoftCode(code: string): Promise<MicrosoftTokenResponse> {
    const { clientId, clientSecret, redirectUri } = getConfig();
    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
    });

    const res = await fetch(`${AUTHORITY}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Microsoft token exchange failed: ${err}`);
    }

    return res.json();
}

/**
 * Use a refresh token to get a new access token.
 * Returns the new tokens or throws on invalid_grant (needs reconnect).
 */
export async function refreshMicrosoftToken(refreshToken: string): Promise<MicrosoftTokenResponse> {
    const { clientId, clientSecret } = getConfig();
    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: SCOPES,
    });

    const res = await fetch(`${AUTHORITY}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(err.error === 'invalid_grant'
            ? 'INVALID_GRANT'
            : `Microsoft token refresh failed: ${JSON.stringify(err)}`
        );
    }

    return res.json();
}

/**
 * Fetch the signed-in user's email address from Microsoft Graph.
 * Used after token exchange to store the account email on the connection.
 */
export async function getMicrosoftUserEmail(accessToken: string): Promise<string> {
    const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch Microsoft user profile: ${res.status}`);
    }

    const data = await res.json();
    const email = data.mail || data.userPrincipalName;
    if (!email) throw new Error('Could not determine Microsoft account email');
    return email;
}
