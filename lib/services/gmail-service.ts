import { createClient } from '@/lib/supabase/server';
import { getGoogleOAuthClient } from '@/lib/utils/google';
import { google } from 'googleapis';

export class GmailService {
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
            // VERSION MARKER - v2 verifyConnection
            console.log(`[GmailVerify] ====== V2 VERIFY RUNNING for ${connectionId} ======`);

            // 1. Fetch connection
            const { data: connection, error: dbError } = await supabase
                .from('connections')
                .select('gmail_refresh_token, gmail_access_token, gmail_account_email, reservation_label')
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

            // 3. Fetch labels
            const labelsRes = await gmail.users.labels.list({ userId: 'me' });
            const labels = labelsRes.data.labels || [];
            const labelNames = labels.map(l => l.name).filter(Boolean) as string[];

            // 4. Use configured label
            // STRICT MODE: No default fallback unless explicitly configured.
            // If label is missing (null/empty string), marked as Error/Incomplete immediately.
            const rawLabel = connection.reservation_label;

            if (!rawLabel || !rawLabel.trim()) {
                console.warn(`[GmailVerify] No label configured for connection ${connectionId}. Marking as incomplete.`);
                await this.updateStatus(connectionId, 'error', 'LABEL_NOT_CONFIGURED', 'No Gmail label configured', supabase);
                return { success: false, error: 'No label configured', code: 'LABEL_NOT_CONFIGURED' };
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

            if (err.message?.includes('invalid_grant')) {
                code = 'TOKEN_REVOKED';
                msg = 'Gmail access revoked or expired.';
            }

            await this.updateStatus(connectionId, 'error', code, msg, supabase);
            return { success: false, error: msg, code };
        }
    }

    private static async updateStatus(
        id: string,
        status: 'connected' | 'error' | 'pending',
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

        await supabase.from('connections').update({
            gmail_status: status,
            gmail_last_error_code: code || null,
            gmail_last_error_message: msg || null,
            gmail_last_verified_at: new Date().toISOString()
        }).eq('id', id);
    }
}
