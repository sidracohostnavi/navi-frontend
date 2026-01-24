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

            // 4. Use configured label or default to 'Airbnb'
            // BUGFIX: Trim whitespace from label names
            const rawLabel = connection.reservation_label || 'Airbnb';
            const labelName = rawLabel.trim();
            const labelSource = connection.reservation_label ? 'db' : 'default';
            console.log(`[GmailVerify] Checking for label: "${labelName}" (source: ${labelSource})`);

            const targetLabel = labels.find(l => l.name?.toLowerCase() === labelName.toLowerCase());

            if (!targetLabel) {
                // PERMISSIVE FIX: Missing label should NOT break OAuth connection
                // Log the issue but still mark as connected so user can fix label in settings
                console.warn(`[GmailVerify] Label "${labelName}" NOT FOUND. Available: ${labelNames.join(', ')}`);
                console.warn(`[GmailVerify] Marking connected anyway - user must fix label in settings.`);
                // Don't save the bad label, just proceed
            } else {
                console.log(`[GmailVerify] ✅ Found label "${targetLabel.name}" for ${connectionId}`);
            }

            // Save label logic: Only save if we found it OR if it's the user's explicit choice?
            // If targetLabel found AND it was default, save it to DB
            if (targetLabel && !connection.reservation_label) {
                await supabase
                    .from('connections')
                    .update({ reservation_label: labelName })
                    .eq('id', connectionId);
            }

            // Always mark connected if we got here (OAuth worked)
            await this.updateStatus(connectionId, 'connected', undefined, undefined, supabase);

            return {
                success: true,
                email: accountEmail,
                label: targetLabel?.name || null,
                label_source: labelSource
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
        await supabase.from('connections').update({
            gmail_status: status,
            gmail_last_error_code: code || null,
            gmail_last_error_message: msg || null,
            gmail_last_verified_at: new Date().toISOString()
        }).eq('id', id);
    }
}
