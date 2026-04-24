// Microsoft Mail Service — Microsoft Graph API integration
//
// Handles both:
//   SEND  — sendReply() posts a reply into the correct Outlook thread
//   FETCH — fetchMessages() reads relay emails from the Outlook inbox
//           (called by email-processor.ts as the Microsoft equivalent of GmailService.fetchMessages)
//
// Tokens are stored on the `connections` table under the microsoft_* columns.
// This service handles token refresh transparently (like GmailService does for Gmail).

import { createCohostClient } from '@/lib/supabase/cohostServer';
import { refreshMicrosoftToken } from '@/lib/utils/microsoft';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export class MicrosoftMailService {
    // ─── Token Management ──────────────────────────────────────────────────────

    /**
     * Get a valid access token for the connection.
     * Refreshes automatically if the stored token is expired or missing.
     * Returns null (+ updates status to needs_reconnect) on invalid_grant.
     */
    static async getAccessToken(
        connectionId: string,
        supabase?: any
    ): Promise<{ token: string | null; error?: string }> {
        const db = supabase || createCohostClient();

        const { data: conn } = await db
            .from('connections')
            .select('microsoft_access_token, microsoft_refresh_token, microsoft_token_expires_at, microsoft_status')
            .eq('id', connectionId)
            .single();

        if (!conn?.microsoft_refresh_token) {
            return { token: null, error: 'No Microsoft refresh token — reconnect required' };
        }

        // Token expires_at is Unix ms; refresh if within 5 minutes of expiry
        const expiresAt = conn.microsoft_token_expires_at || 0;
        const isExpired = Date.now() > expiresAt - 5 * 60 * 1000;

        if (!isExpired && conn.microsoft_access_token) {
            return { token: conn.microsoft_access_token };
        }

        // Refresh
        try {
            const tokens = await refreshMicrosoftToken(conn.microsoft_refresh_token);
            const newExpiry = Date.now() + tokens.expires_in * 1000;

            await db.from('connections').update({
                microsoft_access_token: tokens.access_token,
                microsoft_token_expires_at: newExpiry,
                microsoft_status: 'connected',
                // Microsoft may or may not return a new refresh token; keep existing if not
                ...(tokens.refresh_token ? { microsoft_refresh_token: tokens.refresh_token } : {}),
            }).eq('id', connectionId);

            console.log(`[MicrosoftMail] ✅ Token refreshed for ${connectionId}`);
            return { token: tokens.access_token };
        } catch (err: any) {
            const needsReconnect = err.message === 'INVALID_GRANT';
            await db.from('connections').update({
                microsoft_status: needsReconnect ? 'needs_reconnect' : 'error',
            }).eq('id', connectionId);
            return { token: null, error: needsReconnect ? 'NEEDS_RECONNECT' : err.message };
        }
    }

    // ─── Fetch (Ingest) ────────────────────────────────────────────────────────

    /**
     * Fetch messages from Outlook.
     *
     * OTA mode (searchQuery provided): searches the full mailbox using KQL
     * $search so no folder setup is required — e.g. "from:airbnb.com OR from:vrbo.com".
     *
     * Legacy mode (no searchQuery): fetches from a specific folder by display
     * name (folderName defaults to 'Inbox').
     */
    static async fetchMessages(
        connectionId: string,
        folderName: string = 'Inbox',
        supabase?: any,
        searchQuery?: string,
    ): Promise<MicrosoftRawMessage[]> {
        const db = supabase || createCohostClient();
        const { token, error } = await this.getAccessToken(connectionId, db);
        if (!token) {
            console.warn(`[MicrosoftMail.fetchMessages] Auth failed for ${connectionId}: ${error}`);
            return [];
        }

        const SELECT = 'id,subject,from,replyTo,bodyPreview,internetMessageId,conversationId,receivedDateTime,body,internetMessageHeaders';

        // Build the initial page URL
        let nextLink: string | null;
        if (searchQuery) {
            // OTA mode: KQL $search across all mailbox messages — no folder resolution needed
            console.log(`[MicrosoftMail.fetchMessages] OTA search query: ${searchQuery}`);
            const encoded = encodeURIComponent(`"${searchQuery}"`);
            nextLink = `${GRAPH}/me/messages?$top=100&$search=${encoded}&$select=${SELECT}`;
        } else {
            // Legacy mode: resolve folder display name to Graph folder ID
            const folderId = await this.resolveFolderId(token, folderName);
            if (!folderId) {
                console.warn(`[MicrosoftMail.fetchMessages] Folder "${folderName}" not found`);
                return [];
            }
            nextLink = `${GRAPH}/me/mailFolders/${folderId}/messages?$top=100&$select=${SELECT}`;
        }

        // Page through results
        const messages: MicrosoftRawMessage[] = [];
        let pageCount = 0;
        while (nextLink && pageCount < 50) {
            const response = await fetch(nextLink, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });

            if (!response.ok) {
                console.error(`[MicrosoftMail.fetchMessages] Graph error: ${response.status}`);
                break;
            }

            const pageData: { value?: MicrosoftRawMessage[]; '@odata.nextLink'?: string } = await response.json();
            messages.push(...(pageData.value || []));
            nextLink = pageData['@odata.nextLink'] || null;
            pageCount++;
        }

        const mode = searchQuery ? `OTA search "${searchQuery}"` : `folder "${folderName}"`;
        console.log(`[MicrosoftMail.fetchMessages] Fetched ${messages.length} messages via ${mode}`);
        return messages;
    }

    /**
     * Resolve an Outlook folder display name to its Graph ID.
     * Returns null if not found.
     */
    private static async resolveFolderId(
        accessToken: string,
        displayName: string
    ): Promise<string | null> {
        const res = await fetch(`${GRAPH}/me/mailFolders?$top=100`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const folders: any[] = data.value || [];
        const match = folders.find(
            f => f.displayName?.toLowerCase() === displayName.toLowerCase()
        );
        return match?.id || null;
    }

    /**
     * List Outlook mail folders (equivalent of Gmail labels list).
     * Used in settings UI for the host to select which folder to sync from.
     */
    static async listFolders(connectionId: string, supabase?: any): Promise<{ id: string; name: string }[]> {
        const db = supabase || createCohostClient();
        const { token, error } = await this.getAccessToken(connectionId, db);
        if (!token) {
            throw new Error(error || 'Not authenticated');
        }

        const res = await fetch(`${GRAPH}/me/mailFolders?$top=100`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Failed to list Outlook folders: ${text}`);
        }

        const data = await res.json();
        return (data.value || []).map((f: any) => ({
            id: f.id,
            name: f.displayName,
        }));
    }

    // ─── Send ──────────────────────────────────────────────────────────────────

    /**
     * Send a reply into an Outlook conversation thread.
     *
     * graphMessageId — the Graph message ID of the last inbound message in the thread.
     *                  Stored in gmail_messages.raw_metadata.graph_message_id when ingested
     *                  via MicrosoftMailService.fetchMessages().
     * replyBody      — plain text of the reply.
     */
    static async sendReply(
        connectionId: string,
        graphMessageId: string,
        replyBody: string,
        supabase?: any
    ): Promise<{ success: boolean; sentMessageId?: string; error?: string }> {
        const db = supabase || createCohostClient();
        const { token, error } = await this.getAccessToken(connectionId, db);
        if (!token) {
            return { success: false, error: error || 'Microsoft auth failed' };
        }

        // Use Graph's createReply + send pattern for proper threading
        // Step 1: Create a draft reply (preserves In-Reply-To / References)
        const createRes = await fetch(
            `${GRAPH}/me/messages/${graphMessageId}/createReply`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            }
        );

        if (!createRes.ok) {
            const text = await createRes.text();
            console.error('[MicrosoftMail.sendReply] createReply failed:', text);
            return { success: false, error: `createReply failed: ${createRes.status}` };
        }

        const draft = await createRes.json();
        const draftId: string = draft.id;

        // Step 2: Update draft body with our reply text
        const updateRes = await fetch(`${GRAPH}/me/messages/${draftId}`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                body: { contentType: 'Text', content: replyBody },
            }),
        });

        if (!updateRes.ok) {
            const text = await updateRes.text();
            console.error('[MicrosoftMail.sendReply] PATCH draft failed:', text);
            // Try to clean up draft
            await fetch(`${GRAPH}/me/messages/${draftId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
            return { success: false, error: `Update draft failed: ${updateRes.status}` };
        }

        // Step 3: Send the draft
        const sendRes = await fetch(`${GRAPH}/me/messages/${draftId}/send`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!sendRes.ok) {
            const text = await sendRes.text();
            console.error('[MicrosoftMail.sendReply] send failed:', text);
            return { success: false, error: `Send failed: ${sendRes.status}` };
        }

        console.log(`[MicrosoftMail.sendReply] ✅ Reply sent (draft ${draftId})`);

        // Update last success time
        await db.from('connections').update({
            microsoft_status: 'connected',
        }).eq('id', connectionId);

        return { success: true, sentMessageId: draftId };
    }
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MicrosoftRawMessage = {
    id: string;                    // Graph message ID (stable)
    subject: string;
    from: { emailAddress: { address: string; name: string } };
    replyTo: { emailAddress: { address: string; name: string } }[];
    bodyPreview: string;           // ~255 char preview
    internetMessageId: string;     // RFC 2822 Message-ID (for threading headers)
    conversationId: string;        // Outlook thread ID (equivalent of Gmail threadId)
    receivedDateTime: string;      // ISO 8601
    body: { contentType: string; content: string };
    internetMessageHeaders?: { name: string; value: string }[];
};
