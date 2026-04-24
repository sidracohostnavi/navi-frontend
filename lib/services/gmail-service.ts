import { createClient } from '@/lib/supabase/server';
import { getGoogleOAuthClient } from '@/lib/utils/google';
import { google } from 'googleapis';

type GmailStatus = 'connected' | 'error' | 'pending' | 'needs_reconnect';

export class GmailService {
    /**
     * Attempt to refresh the access token using the stored refresh token.
     * On success: persists new access_token and expiry.
     * On failure (invalid_grant): sets gmail_status = 'needs_reconnect'.
     */
    static async refreshAccessToken(
        connectionId: string,
        supabaseClient?: any
    ): Promise<{ success: boolean; newAccessToken?: string; error?: string }> {
        const supabase = supabaseClient || await createClient();

        console.log(`[GmailRefresh] Attempting token refresh for ${connectionId}`);

        try {
            // 1. Fetch refresh token
            const { data: connection, error: dbError } = await supabase
                .from('connections')
                .select('gmail_refresh_token')
                .eq('id', connectionId)
                .single();

            if (dbError || !connection?.gmail_refresh_token) {
                console.error('[GmailRefresh] No refresh token available');
                await this.updateStatus(connectionId, 'needs_reconnect', 'NO_REFRESH_TOKEN', 'No refresh token available', supabase);
                return { success: false, error: 'No refresh token available' };
            }

            // 2. Attempt refresh
            const oauth2Client = getGoogleOAuthClient();
            oauth2Client.setCredentials({ refresh_token: connection.gmail_refresh_token });

            const { credentials } = await oauth2Client.refreshAccessToken();

            if (!credentials.access_token) {
                throw new Error('No access token in refresh response');
            }

            // 3. Persist new tokens
            const updateData: any = {
                gmail_access_token: credentials.access_token,
                gmail_last_success_at: new Date().toISOString()
            };
            if (credentials.expiry_date) {
                updateData.gmail_token_expires_at = credentials.expiry_date;
            }

            await supabase
                .from('connections')
                .update(updateData)
                .eq('id', connectionId);

            console.log(`[GmailRefresh] ✅ Token refreshed successfully for ${connectionId}`);

            return { success: true, newAccessToken: credentials.access_token };

        } catch (err: any) {
            console.error('[GmailRefresh] Error:', err);

            // Check for revoked/expired refresh token
            if (err.message?.includes('invalid_grant') || err.message?.includes('Token has been expired or revoked')) {
                await this.updateStatus(connectionId, 'needs_reconnect', 'REFRESH_TOKEN_REVOKED', 'Gmail access revoked. Please reconnect.', supabase);
                return { success: false, error: 'Refresh token revoked' };
            }

            await this.updateStatus(connectionId, 'error', 'REFRESH_FAILED', err.message, supabase);
            return { success: false, error: err.message };
        }
    }

    /**
     * Create an authenticated Gmail client for a connection.
     * Automatically handles token refresh if access token is expired.
     */
    static async createAuthenticatedClient(
        connectionId: string,
        supabaseClient?: any
    ): Promise<{ success: boolean; gmail?: any; error?: string; needsReconnect?: boolean }> {
        const supabase = supabaseClient || await createClient();

        try {
            // 1. Fetch tokens
            const { data: connection, error: dbError } = await supabase
                .from('connections')
                .select('gmail_access_token, gmail_refresh_token, gmail_token_expires_at, archived_at')
                .eq('id', connectionId)
                .single();

            if (dbError || !connection) {
                return { success: false, error: 'Connection not found' };
            }

            // Guard: don't allow archived connections
            if (connection.archived_at) {
                return { success: false, error: 'Connection is archived' };
            }

            if (!connection.gmail_refresh_token && !connection.gmail_access_token) {
                return { success: false, error: 'No Gmail tokens available', needsReconnect: true };
            }

            // 2. Check if access token is expired
            const now = Date.now();
            const expiresAt = connection.gmail_token_expires_at;
            const isExpired = expiresAt && now > expiresAt - 60000; // 1 minute buffer

            let accessToken = connection.gmail_access_token;

            if (isExpired || !accessToken) {
                console.log(`[GmailClient] Access token expired/missing for ${connectionId}, attempting refresh`);
                const refreshResult = await this.refreshAccessToken(connectionId, supabase);

                if (!refreshResult.success) {
                    return {
                        success: false,
                        error: refreshResult.error || 'Token refresh failed',
                        needsReconnect: refreshResult.error?.includes('revoked')
                    };
                }

                accessToken = refreshResult.newAccessToken;
            }

            // 3. Create client
            const oauth2Client = getGoogleOAuthClient();
            oauth2Client.setCredentials({
                access_token: accessToken,
                refresh_token: connection.gmail_refresh_token
            });

            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            return { success: true, gmail };

        } catch (err: any) {
            console.error('[GmailClient] Error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Verify a connection's Gmail access.
     * Uses configured label or defaults to 'Airbnb'.
     * NO auto-pick - deterministic label selection.
     */
    static async verifyConnection(
        connectionId: string,
        tokens?: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null },
        supabaseClient?: any
    ) {
        const supabase = supabaseClient || await createClient();

        try {
            // VERSION MARKER - v3 verifyConnection with token refresh
            console.log(`[GmailVerify] ====== V3 VERIFY RUNNING for ${connectionId} ======`);

            // 1. Fetch connection
            const { data: connection, error: dbError } = await supabase
                .from('connections')
                .select('gmail_refresh_token, gmail_access_token, gmail_account_email, gmail_label_name, reservation_label')
                .eq('id', connectionId)
                .single();

            if (dbError || !connection) {
                console.error('[GmailVerify] Connection lookup failed:', dbError);
                throw new Error('Connection not found');
            }

            // Merge tokens
            const refresh_token = tokens?.refresh_token || connection.gmail_refresh_token;
            const access_token = tokens?.access_token || connection.gmail_access_token;
            const accountEmail = connection.gmail_account_email;

            if (!refresh_token && !access_token) {
                console.error('[GmailVerify] No tokens found');
                await this.updateStatus(connectionId, 'error', 'NO_TOKENS', 'No Gmail tokens available', supabase);
                return { success: false, error: 'No tokens', code: 'NO_TOKENS' };
            }

            // 2. Setup OAuth client
            const oauth2Client = getGoogleOAuthClient();
            const creds: any = {};
            if (refresh_token) creds.refresh_token = refresh_token;
            if (access_token) creds.access_token = access_token;
            oauth2Client.setCredentials(creds);

            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            // 3. Fetch labels (with retry on token error)
            let labels: any[] = [];
            try {
                const labelsRes = await gmail.users.labels.list({ userId: 'me' });
                labels = labelsRes.data.labels || [];
            } catch (labelErr: any) {
                // Check for token expiry
                if (labelErr.code === 401 || labelErr.message?.includes('invalid_grant')) {
                    console.log('[GmailVerify] Token expired, attempting refresh...');
                    const refreshResult = await this.refreshAccessToken(connectionId, supabase);
                    if (refreshResult.success) {
                        // Retry with new token
                        oauth2Client.setCredentials({
                            access_token: refreshResult.newAccessToken,
                            refresh_token
                        });
                        const retryGmail = google.gmail({ version: 'v1', auth: oauth2Client });
                        const retryRes = await retryGmail.users.labels.list({ userId: 'me' });
                        labels = retryRes.data.labels || [];
                    } else {
                        throw new Error('Token refresh failed: ' + refreshResult.error);
                    }
                } else {
                    throw labelErr;
                }
            }

            const labelNames = labels.map(l => l.name).filter(Boolean) as string[];

            // 4. Use configured label (gmail_label_name preferred, fallback to reservation_label)
            // If label is missing, OAuth is still valid - mark as connected but note label is needed
            const rawLabel = connection.gmail_label_name || connection.reservation_label;

            if (!rawLabel || !rawLabel.trim()) {
                console.log(`[GmailVerify] Connection ${connectionId} - OAuth valid but no label configured yet.`);
                // Still mark as connected (OAuth works!) - UI will prompt for label selection
                await this.updateStatus(connectionId, 'connected', undefined, undefined, supabase);
                return {
                    success: true,
                    email: accountEmail,
                    needs_label: true,
                    message: 'Gmail connected. Please select a label for reservation emails.'
                };
            }

            const labelName = rawLabel.trim();
            console.log(`[GmailVerify] Verifying configured label: "${labelName}"`);

            const targetLabel = labels.find(l => l.name?.toLowerCase() === labelName.toLowerCase());

            if (!targetLabel) {
                // STRICT MODE: Missing label = Error
                console.error(`[GmailVerify] Label "${labelName}" NOT FOUND in Gmail account.`);
                const availableMsg = `Available labels: ${labelNames.slice(0, 5).join(', ')}...`;

                await this.updateStatus(connectionId, 'error', 'LABEL_NOT_FOUND', `Label "${labelName}" not found in Gmail. ${availableMsg}`, supabase);
                return { success: false, error: `Label "${labelName}" not found`, code: 'LABEL_NOT_FOUND' };
            } else {
                console.log(`[GmailVerify] ✅ Found label "${targetLabel.name}" for ${connectionId}`);
            }

            // Always mark connected if we got here (OAuth valid + Label valid)
            await this.updateStatus(connectionId, 'connected', undefined, undefined, supabase);

            return {
                success: true,
                email: accountEmail,
                label: targetLabel?.name || null,
                label_source: 'db'
            };

        } catch (err: any) {
            console.error('[GmailVerify] Error:', err);

            let code = 'UNKNOWN';
            let msg = err.message;
            let status: GmailStatus = 'error';

            if (err.message?.includes('invalid_grant') || err.message?.includes('revoked')) {
                code = 'TOKEN_REVOKED';
                msg = 'Gmail access revoked or expired. Please reconnect.';
                status = 'needs_reconnect';
            }

            await this.updateStatus(connectionId, status, code, msg, supabase);
            return { success: false, error: msg, code };
        }
    }

    /**
     * Send a reply into an existing Gmail thread.
     *
     * Used for gmail_relay conversations: the host's reply goes back into
     * the Airbnb/VRBO relay thread, which forwards it to the guest.
     *
     * @param connectionId  - The Gmail connection to send from
     * @param threadId      - Gmail threadId (cohost_conversations.gmail_thread_id)
     * @param replyToMsgId  - Gmail message ID of the last inbound message (for In-Reply-To)
     * @param replyBody     - Plain-text body of the reply
     *
     * Fetches From/Reply-To/Subject/Message-ID from the original message so
     * the reply headers are correct for proper relay threading.
     */
    static async sendReply(
        connectionId: string,
        threadId: string,
        replyToMsgId: string,
        replyBody: string,
        supabaseClient?: any
    ): Promise<{ success: boolean; sentGmailMessageId?: string; error?: string }> {
        const supabase = supabaseClient || await createClient();

        // 1. Get authenticated Gmail client
        const clientResult = await this.createAuthenticatedClient(connectionId, supabase);
        if (!clientResult.success || !clientResult.gmail) {
            return { success: false, error: clientResult.error || 'Failed to authenticate Gmail client' };
        }
        const gmail = clientResult.gmail;

        // 2. Fetch headers from the message we're replying to
        let replyTo: string;
        let subject: string;
        let messageId: string;
        let references: string;

        try {
            const detail = await gmail.users.messages.get({
                userId: 'me',
                id: replyToMsgId,
                format: 'metadata',
                metadataHeaders: ['From', 'Reply-To', 'Subject', 'Message-ID', 'References'],
            });

            const headers: { name: string; value: string }[] = detail.data.payload?.headers || [];
            const h = (name: string) => headers.find(x => x.name.toLowerCase() === name.toLowerCase())?.value || '';

            // Prefer Reply-To (relay address) over From for Airbnb/VRBO threads
            replyTo   = h('Reply-To') || h('From');
            subject   = h('Subject');
            messageId = h('Message-ID');
            references = h('References');

            if (!replyTo) {
                return { success: false, error: 'Could not determine reply-to address from original message' };
            }
        } catch (err: any) {
            console.error('[GmailService.sendReply] Failed to fetch message headers:', err.message);
            return { success: false, error: `Failed to fetch message headers: ${err.message}` };
        }

        // 3. Build MIME reply
        const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

        // References chain: existing references + current Message-ID
        const newReferences = [references, messageId].filter(Boolean).join(' ');

        const mimeLines = [
            `To: ${replyTo}`,
            `Subject: ${replySubject}`,
            `In-Reply-To: ${messageId}`,
            `References: ${newReferences}`,
            `Content-Type: text/plain; charset=UTF-8`,
            ``,
            replyBody,
        ].join('\r\n');

        const rawEncoded = Buffer.from(mimeLines).toString('base64url');

        // 4. Send
        try {
            const sendResult = await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: rawEncoded,
                    threadId,
                },
            });

            await this.recordSuccess(connectionId, supabase);

            console.log(`[GmailService.sendReply] ✅ Reply sent, Gmail message ID: ${sendResult.data.id}`);
            return { success: true, sentGmailMessageId: sendResult.data.id };

        } catch (err: any) {
            console.error('[GmailService.sendReply] Send failed:', err.message);
            return { success: false, error: `Gmail send failed: ${err.message}` };
        }
    }

    /**
     * Record a successful Gmail API operation
     */
    static async recordSuccess(connectionId: string, supabaseClient?: any): Promise<void> {
        const supabase = supabaseClient || await createClient();
        await supabase
            .from('connections')
            .update({
                gmail_last_success_at: new Date().toISOString(),
                gmail_status: 'connected',
                gmail_last_error_code: null,
                gmail_last_error_message: null
            })
            .eq('id', connectionId);
    }

    /**
     * Update connection status with error tracking
     */
    private static async updateStatus(
        id: string,
        status: GmailStatus,
        code?: string,
        msg?: string,
        supabaseClient?: any
    ) {
        const supabase = supabaseClient || await createClient();

        // Audit Log
        console.log(JSON.stringify({
            event: 'connection_health',
            connection_id: id,
            status: status,
            error_code: code || null,
            reason: msg || null
        }));

        const updateData: any = {
            gmail_status: status,
            gmail_last_verified_at: new Date().toISOString()
        };

        if (status === 'connected') {
            // On success, clear errors and record success time
            updateData.gmail_last_success_at = new Date().toISOString();
            updateData.gmail_last_error_code = null;
            updateData.gmail_last_error_message = null;
        } else {
            // On error, record error details
            updateData.gmail_last_error_code = code || null;
            updateData.gmail_last_error_message = msg || null;
        }

        await supabase.from('connections').update(updateData).eq('id', id);
    }
}
