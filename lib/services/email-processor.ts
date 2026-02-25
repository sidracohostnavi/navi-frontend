import { createClient } from '@/lib/supabase/server';
import { getGoogleOAuthClient } from '@/lib/utils/google';
import { google } from 'googleapis';
import { classifyEmail } from '@/lib/services/email-classifier';

type ExtractedFact = {
    check_in: string;
    check_out: string;
    guest_name: string | null;      // null = could not extract cleanly
    guest_count: number | null;     // null = could not extract (never default to 1)
    confirmation_code: string;
    listing_name: string;
    confidence: number;
    raw?: any;
};

import { AppError } from '@/lib/utils/api-errors';

export class EmailProcessor {
    static async fetchGmailMessages(connectionId: string, label: string, supabaseClient?: any) {
        const supabase = supabaseClient || await createClient();

        console.log(`[EmailProcessor] ========== FETCH GMAIL MESSAGES ==========`);
        console.log(`[EmailProcessor] Connection ID: ${connectionId}`);
        console.log(`[EmailProcessor] Target Label: ${label}`);

        const { data: connection } = await supabase
            .from('connections')
            .select('gmail_refresh_token')
            .eq('id', connectionId)
            .single();

        if (!connection?.gmail_refresh_token) {
            console.warn(`[EmailProcessor] ❌ No Gmail token for connection ${connectionId}`);
            return [];
        }

        const oauth2Client = getGoogleOAuthClient();
        oauth2Client.setCredentials({ refresh_token: connection.gmail_refresh_token });
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // 1. Resolve Label ID from Name
        const labelsRes = await gmail.users.labels.list({ userId: 'me' });
        const labels = labelsRes.data.labels || [];
        const targetLabel = labels.find(l => l.name?.toLowerCase() === label.toLowerCase());

        if (!targetLabel?.id) {
            console.warn(`[EmailProcessor] ❌ Label "${label}" not found in Gmail account.`);
            return [];
        }

        console.log(`[EmailProcessor] Resolved Label "${label}" to ID: ${targetLabel.id}`);

        // 2. LIST ALL Message IDs (Pagination)
        let allMessageIds: string[] = [];
        let nextPageToken: string | undefined = undefined;
        let pageCount = 0;
        const MAX_PAGES = 50; // Safety cap (approx 5000 emails)

        try {
            do {
                const listRes: any = await gmail.users.messages.list({
                    userId: 'me',
                    labelIds: [targetLabel.id],
                    maxResults: 100, // Max allowed per page
                    pageToken: nextPageToken
                });

                const messages = listRes.data.messages || [];
                if (messages.length > 0) {
                    allMessageIds.push(...messages.map((m: any) => m.id));
                }

                nextPageToken = listRes.data.nextPageToken;
                pageCount++;

                if (pageCount % 5 === 0) console.log(`[EmailProcessor] Pagination: Page ${pageCount}, Found ${allMessageIds.length} IDs so far...`);

            } while (nextPageToken && pageCount < MAX_PAGES);
        } catch (err: any) {
            console.error(`[EmailProcessor] Error listing messages: ${err.message}`);

            // Surface rate limit errors to user instead of silent fail
            if (err.code === 429 || err.code === 403 || err.message?.includes('quota') || err.message?.includes('rate')) {
                throw new AppError(
                    'Gmail rate limit reached. Please wait a few minutes and try again.',
                    'RATE_LIMITED',
                    429,
                    'Gmail API quota exceeded temporarily.'
                );
            }

            // For other errors, continue with what we have (partial results)
            // but log prominently
            console.warn(`[EmailProcessor] ⚠️ Continuing with partial results due to: ${err.message}`);
        }

        console.log(`[EmailProcessor] Total messages in label: ${allMessageIds.length}`);

        if (allMessageIds.length === 0) return [];

        // 3. DIFF against DB (Idempotency)
        // Fetch ALL existing IDs for this connection to check what we already have.
        // For 400+ emails, fetching just IDs is cheap. 
        // If it grows to 10k+, we might need chunked queries, but 5000 is fine for Postgres IN check or partial fetch.
        // Actually, let's fetch ALL local IDs for this connection.

        const { data: existingRows, error: dbError } = await supabase
            .from('gmail_messages')
            .select('gmail_message_id')
            .eq('connection_id', connectionId);

        if (dbError) {
            console.error(`[EmailProcessor] Failed to fetch existing IDs`, dbError);
            return [];
        }

        const existingSet = new Set(existingRows?.map((r: { gmail_message_id: string }) => r.gmail_message_id) || []);
        const missingIds = allMessageIds.filter(id => !existingSet.has(id));

        console.log(`[EmailProcessor] Sync Status: Total=${allMessageIds.length}, Existing=${existingSet.size}, New/Missing=${missingIds.length}`);

        if (missingIds.length === 0) {
            console.log(`[EmailProcessor] active sync up-to-date.`);
            return [];
        }

        // 4. FETCH DETAILS (Batch Processing with Concurrency Limit)
        // We do this here instead of returning just IDs to keep logic encapsulated.
        // Process in chunks of 50 to manage memory/network
        const results = [];
        const CHUNK_SIZE = 50;

        for (let i = 0; i < missingIds.length; i += CHUNK_SIZE) {
            const chunkIds = missingIds.slice(i, i + CHUNK_SIZE);
            console.log(`[EmailProcessor] Fetching details for chunk ${i / CHUNK_SIZE + 1} (${chunkIds.length} items)...`);

            // Fetch details for this chunk with concurrency limit
            const chunkDetails = await this.fetchDetails(gmail, chunkIds);
            results.push(...chunkDetails);
        }

        return results;
    }

    private static async fetchDetails(gmail: any, messageIds: string[]) {
        const messageDetails: any[] = [];

        // Simple Concurrency Control
        // Run X promises at a time
        const CONCURRENCY = 5;

        const processMsg = async (id: string, retries = 3) => {
            try {
                const detail = await gmail.users.messages.get({
                    userId: 'me',
                    id: id,
                    format: 'full'
                });

                const payload = detail.data.payload;
                const headers = payload?.headers || [];
                const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
                const snippet = detail.data.snippet || '';

                // Extract Body
                let bodyHtml = '';
                let bodyText = '';

                const getPart = (parts: any[], mimeType: string): any => {
                    return parts.find(p => p.mimeType === mimeType);
                };
                const decode = (data: string) => Buffer.from(data, 'base64').toString('utf-8');

                if (payload?.body?.data) {
                    if (payload.mimeType === 'text/html') bodyHtml = decode(payload.body.data);
                    else bodyText = decode(payload.body.data);
                } else if (payload?.parts) {
                    let parts = payload.parts;
                    const alternative = parts.find((p: any) => p.mimeType === 'multipart/alternative');
                    if (alternative?.parts) parts = alternative.parts;

                    const htmlPart = getPart(parts, 'text/html');
                    const textPart = getPart(parts, 'text/plain');

                    if (htmlPart?.body?.data) bodyHtml = decode(htmlPart.body.data);
                    if (textPart?.body?.data) bodyText = decode(textPart.body.data);
                }

                return {
                    id: detail.data.id || id, // API ID
                    gmail_message_id: detail.data.id || id, // Explicit field for processor
                    subject,
                    snippet,
                    bodyText: bodyText || snippet,
                    bodyHtml: bodyHtml
                };

            } catch (err: any) {
                // Rate Limit Handling (429 or 403)
                if (retries > 0 && (err.code === 429 || err.code === 403 || err.code === 503)) {
                    const delay = (4 - retries) * 1000; // Exponential-ish backoff
                    await new Promise(res => setTimeout(res, delay));
                    return processMsg(id, retries - 1);
                }
                console.warn(`[EmailProcessor] Failed to fetch details for ${id}: ${err.message}`);
                return null;
            }
        };

        // Execute Batch
        for (let i = 0; i < messageIds.length; i += CONCURRENCY) {
            const batch = messageIds.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.all(batch.map(id => processMsg(id)));
            messageDetails.push(...batchResults.filter(Boolean));
        }

        return messageDetails;
    }

    static async processMessages(connectionId: string, messages?: any[], supabaseClient?: any) {
        const supabase = supabaseClient || await createClient();
        const results: any[] = [];
        let msgsToProcess = messages || [];

        // If no messages provided, fetch them (which now invokes pagination + diffing)
        if (msgsToProcess.length === 0) {
            console.log(`[EmailProcessor] ========== PROCESS MESSAGES ==========`);
            console.log(`[EmailProcessor] Connection ID: ${connectionId}`);

            const { data: conn } = await supabase
                .from('connections')
                .select('reservation_label')
                .eq('id', connectionId)
                .single();

            const label = conn?.reservation_label || 'Airbnb';

            // 0. PRE-FLIGHT: Label Conflict Check
            await this.checkForLabelConflict(supabase, connectionId, label);

            msgsToProcess = await this.fetchGmailMessages(connectionId, label, supabase);
        }

        console.log(`[EmailProcessor] Processing ${msgsToProcess.length} messages`);

        let stats = {
            scanned: 0,
            candidates: 0,
            facts_created: 0,
            rejected_duplicate: 0,
            rejected_type: 0,
            rejected_invalid: 0,
            // Granular breakdown
            parse_fail_subject: 0,
            parse_fail_dates: 0,
            parse_fail_name_missing: 0,
            parse_fail_error: 0,
            validation_fail_name: 0,
            validation_fail_date: 0,
            validation_fail_code: 0
        };

        for (const msg of msgsToProcess) {
            stats.scanned++;

            // 2. CLASSIFY EMAIL
            const textForClassification = msg.bodyHtml ?
                msg.bodyHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ')
                : msg.bodyText;

            const classification = classifyEmail(msg.subject, textForClassification);

            // 3. STORE RAW MESSAGE (Always)
            const { error: msgError } = await supabase
                .from('gmail_messages')
                .insert({
                    gmail_message_id: msg.gmail_message_id, // Must be provided
                    connection_id: connectionId,
                    subject: msg.subject,
                    snippet: msg.snippet,
                    raw_metadata: {
                        full_text: msg.bodyText,
                        full_html: msg.bodyHtml,
                        original_msg: msg,
                        classification
                    },
                    processed_at: classification.message_type === 'reservation_confirmation' ? null : new Date().toISOString()
                });

            if (msgError) {
                if (msgError.code === '23505') {
                    // Duplicate raw message? Continue to parsing (Backfill support)
                    stats.rejected_duplicate++;
                } else {
                    console.error(`[EmailProcessor] Error storing Gmail message ${msg.gmail_message_id}:`, msgError);
                    continue;
                }
            }

            // 4. STRICT GATING: Only 'reservation_confirmation' proceeds
            if (classification.message_type !== 'reservation_confirmation') {
                stats.rejected_type++;
                // console.log(`[EmailProcessor] Ignored non-confirmation: ${msg.subject} (${classification.message_type})`);
                continue;
            }

            stats.candidates++;

            // 5. PARSE (Safe Mode)
            // Pass classification state (it's confirmed candidate)
            const textToParse = msg.bodyHtml ?
                msg.bodyHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ')
                : msg.bodyText;

            const fact = this.parseReservationEmail(textToParse, msg.subject, true, stats); // Passed info for tracking

            if (!fact) {
                // breakdown handled inside parseReservationEmail
                console.warn(`[EmailProcessor] Failed to parse confirmed candidate: ${msg.subject}`);
                await supabase.from('gmail_messages').update({
                    raw_metadata: {
                        full_text: msg.bodyText,
                        full_html: msg.bodyHtml,
                        original_msg: msg,
                        classification,
                        parse_error: 'parseReservationEmail returned null'
                    }
                }).eq('gmail_message_id', msg.gmail_message_id);
                continue;
            }

            // Validate Fact
            const validationError = this.validateReservationFact(fact);
            if (validationError) {
                stats.rejected_invalid++;
                console.warn(`[EmailProcessor] Validation failed for ${msg.gmail_message_id}: ${validationError}`);

                await supabase.from('gmail_messages').update({
                    raw_metadata: {
                        full_text: msg.bodyText,
                        full_html: msg.bodyHtml,
                        original_msg: msg,
                        classification,
                        parse_error: validationError
                    }
                }).eq('gmail_message_id', msg.gmail_message_id);

                if (validationError.includes('guest name')) stats.validation_fail_name++;
                else if (validationError.includes('dates')) stats.validation_fail_date++;
                else if (validationError.includes('confirmation code')) stats.validation_fail_code++;

                continue;
            }

            // 6. STORE FACTS (UPSERT)
            // BACKFILL: Removed "checkInDate >= today" filter.

            const sourceGmailId = msg.gmail_message_id; // Canonical ID
            if (!sourceGmailId) {
                console.error(`[EmailProcessor] CRITICAL: Missing gmail_message_id for ${msg.subject}`);
                continue;
            }

            const { data: existingFact } = await supabase
                .from('reservation_facts')
                .select('id')
                .eq('source_gmail_message_id', sourceGmailId)
                .single();

            if (existingFact) {
                console.log(`[EmailProcessor] Fact already exists for ${sourceGmailId}, skipping insert.`);
                await supabase.from('gmail_messages').update({ processed_at: new Date().toISOString() }).eq('gmail_message_id', sourceGmailId);
                continue;
            }

            const { error: factError } = await supabase
                .from('reservation_facts')
                .upsert({
                    source_gmail_message_id: sourceGmailId,
                    connection_id: connectionId,
                    check_in: fact.check_in,
                    check_out: fact.check_out,
                    guest_name: fact.guest_name,
                    guest_count: fact.guest_count,
                    confirmation_code: fact.confirmation_code,
                    listing_name: fact.listing_name,
                    confidence: fact.confidence,
                    raw_data: fact.raw
                }, { onConflict: 'connection_id, source_gmail_message_id' });

            if (factError) {
                console.error(`[EmailProcessor] Error storing fact:`, factError);
            } else {
                stats.facts_created++;
                await supabase.from('gmail_messages').update({ processed_at: new Date().toISOString() }).eq('gmail_message_id', sourceGmailId);
                // console.log(`[EmailProcessor] ✅ Fact Upserted: ${fact.guest_name} (${fact.check_in})`);
            }
        }

        console.log(`[EmailProcessor] Processed Batch:`, JSON.stringify(stats));
        return results; // Note: results array is empty in this logic, we rely on DB input
    }


    /**
     * Fail fast if another active connection in the same workspace uses the same label name.
     */
    private static async checkForLabelConflict(supabase: any, currentConnectionId: string, labelName: string) {
        if (!labelName) return;

        // 1. Get current connection's workspace
        const { data: currentConn } = await supabase
            .from('connections')
            .select('workspace_id, user_id')
            .eq('id', currentConnectionId)
            .single();

        if (!currentConn) return;

        // 2. Find other active/connected connections in same workspace with same label
        // Note: We check 'gmail_status' to ensure we only block active conflicts.
        // We match strictly on name because that's what we use for fetching.
        const { data: conflicts } = await supabase
            .from('connections')
            .select('id, user_id')
            .eq('workspace_id', currentConn.workspace_id)
            .eq('gmail_status', 'connected')
            .neq('id', currentConnectionId)
            .ilike('reservation_label', labelName); // case-insensitive match

        if (conflicts && conflicts.length > 0) {
            // Found conflict!
            const conflictIds = conflicts.map((c: any) => c.id);
            console.error(JSON.stringify({
                event: 'label_isolation_violation',
                violation: 'shared_label_config',
                workspace_id: currentConn.workspace_id,
                label_name: labelName,
                connection_ids: [currentConnectionId, ...conflictIds]
            }));

            throw new AppError(
                `Label "${labelName}" is already being used by another connection in this workspace.`,
                'LABEL_CONFLICT',
                409,
                'Use a unique label for this property (e.g. "Airbnb - Prop A").'
            );
        }
    }

    private static validateReservationFact(fact: ExtractedFact): string | null {
        // Guest Count 1-30 (only validate if present)
        if (fact.guest_count !== null && (fact.guest_count < 1 || fact.guest_count > 30)) {
            return `Invalid guest count: ${fact.guest_count}`;
        }

        // Block bad guest names (only validate if present)
        if (fact.guest_name) {
            const badNames = /service|fee|tax|airbnb|admin/i;
            if (badNames.test(fact.guest_name)) return `Invalid guest name: ${fact.guest_name}`;

            // Block Generic Names (STRICT)
            const forbiddenNames = ['guest', 'reserved', 'unknown', 'empty', 'not available', 'blocked'];
            if (forbiddenNames.includes(fact.guest_name.toLowerCase())) {
                return `Forbidden guest name: ${fact.guest_name}`;
            }
        }

        // Check dates
        if (new Date(fact.check_in) >= new Date(fact.check_out)) return `Invalid dates: ${fact.check_in} >= ${fact.check_out}`;

        // Confirmation code (Optional but good signal)
        // Only valid if alphanumeric
        if (fact.confirmation_code && !/^[A-Z0-9]{8,15}$/.test(fact.confirmation_code)) return `Invalid confirmation code: ${fact.confirmation_code}`;

        return null;
    }

    private static isMaskedGuestName(name: string): boolean {
        if (!name) return true;
        const lower = name.toLowerCase();
        // Common placeholders
        if (lower === 'guest' || lower === 'reserved' || lower === 'blocked' || lower === 'not available') return true;

        // Check for masked patterns (e.g. "M***** P*****" or just "*****")
        // Heuristic: If name has 5 or more asterisks, it's likely masked.
        if ((name.match(/\*/g) || []).length >= 5) return true;

        return false;
    }

    static async enrichBookings(connectionId: string, supabaseClient?: any) {
        const supabase = supabaseClient || await createClient();
        console.log(`[EmailProcessor] ========== ENRICH CALENDAR BOOKINGS ==========`);
        console.log(`[EmailProcessor] Connection ID: ${connectionId}`);

        // 1. Fetch Reservation Facts
        const { data: facts } = await supabase
            .from('reservation_facts')
            .select('*')
            .eq('connection_id', connectionId)
            .order('created_at', { ascending: false })
            .limit(100); // Process recent 100

        if (!facts || facts.length === 0) {
            console.log(`[EmailProcessor] No reservation facts found.`);
            return { enriched: 0, missing: 0 };
        }

        // 1.5. Fetch workspace_id from connection for review item creation
        const { data: connection } = await supabase
            .from('connections')
            .select('workspace_id')
            .eq('id', connectionId) // Fixed connectionId reference
            .single();

        const workspaceId = connection?.workspace_id;

        // 2. Resolve Properties
        const { data: connProps } = await supabase
            .from('connection_properties')
            .select('property_id')
            .eq('connection_id', connectionId);

        const propertyIds = connProps ? connProps.map((cp: { property_id: string }) => cp.property_id) : [];
        if (propertyIds.length === 0) {
            console.warn(`[EmailProcessor] No linked properties.`);
            return { enriched: 0, missing: 0 };
        }

        // 3. Fetch Candidate Bookings (Broad Range)
        const minDate = new Date(); minDate.setDate(minDate.getDate() - 60); // Last 2 months
        const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 365); // Next year

        const { data: bookings } = await supabase
            .from('bookings')
            .select('*')
            .in('property_id', propertyIds)
            .gte('check_in', minDate.toISOString())
            .lte('check_in', maxDate.toISOString());

        // Even if no bookings found, we still want to check for missing bookings based on facts
        const candidateBookings = bookings || [];

        console.log(`[EmailProcessor] Candidates: Facts=${facts.length}, Bookings=${candidateBookings.length}`);

        let enrichedCount = 0;
        let missingCount = 0;

        // 4. Match and Update
        for (const fact of facts) {
            if (!fact.check_in || !fact.check_out) continue;

            let targetBooking = null;
            let matchReason = '';

            // A. Strict Confirmation Code Match
            if (fact.confirmation_code && fact.confirmation_code.length >= 6) {
                targetBooking = candidateBookings.find((b: any) =>
                    b.reservation_code === fact.confirmation_code ||
                    (b.raw_data && JSON.stringify(b.raw_data).includes(fact.confirmation_code)) ||
                    (b.guest_name && b.guest_name.includes(fact.confirmation_code))
                );
                if (targetBooking) matchReason = 'Confirmation Code';
            }

            // B. Fallback: Exact Date Match (Strict)
            if (!targetBooking) {
                const factIn = fact.check_in;
                const factOut = fact.check_out;

                const dateMatches = candidateBookings.filter((b: any) => {
                    const bIn = new Date(b.check_in).toISOString().split('T')[0];
                    const bOut = new Date(b.check_out).toISOString().split('T')[0];
                    return bIn === factIn && bOut === factOut;
                });

                if (dateMatches.length === 1) {
                    targetBooking = dateMatches[0];
                    matchReason = 'Unique Date';
                } else if (dateMatches.length > 1) {
                    // Check Property Ambiguity
                    const distinctProps = new Set(dateMatches.map((b: any) => b.property_id));
                    if (distinctProps.size > 1) {
                        console.warn(`[EmailProcessor] ❌ Ambiguity Block: Fact ${fact.id} matches multiple properties: ${Array.from(distinctProps).join(', ')}`);
                        // Cannot assign safely
                        continue;
                    }
                    // Same property collision? Pick first or skip?
                    // Safe to pick first if same property (likely cleaning block vs booking or duplicate feed)
                    targetBooking = dateMatches[0];
                    matchReason = 'Date (Single Prop)';
                }
            }

            if (targetBooking) {
                // =================================================================
                // CRITICAL RULE: iCal is the sole source of truth for dates
                // ALWAYS sync dates from booking to fact when matched (before any continue)
                // =================================================================
                const bookingCheckIn = new Date(targetBooking.check_in).toISOString().split('T')[0];
                const bookingCheckOut = new Date(targetBooking.check_out).toISOString().split('T')[0];

                // Only update dates if they differ (avoid unnecessary writes)
                if (fact.check_in !== bookingCheckIn || fact.check_out !== bookingCheckOut) {
                    await supabase
                        .from('reservation_facts')
                        .update({
                            check_in: bookingCheckIn,
                            check_out: bookingCheckOut
                        })
                        .eq('id', fact.id);
                    // console.log(`[EmailProcessor] ✅ Synced iCal dates to fact ${fact.id}`);
                }
                // =================================================================

                // CRITICAL SAFETY RULE:
                // - Email enrichment ONLY updates guest metadata (name, count)
                // - NEVER modifies property_id (comes from iCal feed only)
                // - NEVER creates new bookings (UPDATE only, no INSERT/UPSERT)
                // - Property assignment is determined exclusively by iCal sync

                // SAFETY GATE: Only overwrite if current name is missing or masked
                const currentName = targetBooking.guest_name;

                // Prevent "Guest" from overwriting real name
                const isFactFallbackName = fact.guest_name === 'Guest' || fact.guest_name === 'Reserved';

                if (currentName && !EmailProcessor.isMaskedGuestName(currentName)) {
                    // Valid name exists. Do not overwrite.
                    continue;
                }

                // If fact name is just "Guest", NEVER use it to enrich unless we really have nothing. 
                // Actually, if we have nothing, "Guest" is useless enrichment.
                if (isFactFallbackName) {
                    // console.log(`[EmailProcessor] Skipping enrichment - Fact has generic name "${fact.guest_name}"`);
                    continue;
                }

                if (currentName === fact.guest_name) {
                    continue; // No change
                }

                // Enrich (Re-hydration)
                const firstName = fact.guest_name ? fact.guest_name.split(' ')[0] : null;
                const lastInitial = fact.guest_name && fact.guest_name.split(' ').length > 1 ? fact.guest_name.split(' ').pop()?.replace('.', '') : '';
                const displayName = `${firstName} ${lastInitial ? lastInitial + '.' : ''}`;

                // Update booking
                const { error: updateError } = await supabase
                    .from('bookings')
                    .update({
                        guest_name: displayName,
                        guest_count: fact.guest_count,
                        guest_first_name: firstName,
                        guest_last_initial: lastInitial,
                        raw_data: {
                            ...targetBooking.raw_data,
                            enriched_manually: true,
                            from_fact_id: fact.id,
                            enrichment_reason: matchReason
                        }
                    })
                    .eq('id', targetBooking.id);

                if (!updateError) {
                    enrichedCount++;
                    // console.log(`[EmailProcessor] Enriched ${targetBooking.id} -> ${displayName} (${matchReason})`);
                }
            } else {
                // NO MATCH FOUND - Check if missing
                // Only create review item if we have strong signal (Confirmation Code)
                if (fact.confirmation_code && fact.check_in && fact.guest_name) {

                    // Check if already in review items
                    const { data: existingReview } = await supabase
                        .from('enrichment_review_items')
                        .select('id')
                        .eq('connection_id', connectionId)
                        .contains('extracted_data', { confirmation_code: fact.confirmation_code })
                        .single();

                    if (!existingReview && workspaceId) {
                        console.warn(`[EmailProcessor] ⚠️ Booking Missing from Calendar: ${fact.guest_name} (${fact.check_in}) code=${fact.confirmation_code}`);

                        await supabase.from('enrichment_review_items').insert({
                            workspace_id: workspaceId,
                            connection_id: connectionId,
                            extracted_data: fact,
                            status: 'pending'
                        });
                        missingCount++;
                    }
                }
            }
        }

        console.log(`[EmailProcessor] Enrichment Complete. Updated ${enrichedCount} bookings. Identified ${missingCount} missing bookings.`);
        return { enriched: enrichedCount, missing: missingCount };
    }
    /**
     * Reprocess stored Gmail messages and route unmatched reservations to Review items.
     * SAFETY: Does NOT create bookings. Does NOT refetch Gmail. Review-only routing.
     * 
     * This is the ONLY safe path for email-confirmed bookings without iCal backing.
     */
    static async reprocessGmailToReview(connectionId: string) {
        const supabase = await createClient();
        console.log(`[EmailProcessor] ========== REPROCESS GMAIL TO REVIEW ==========`);
        console.log(`[EmailProcessor] Connection ID: ${connectionId}`);

        // 1. Fetch workspace_id DIRECTLY from connection (INVARIANT: connection owns workspace)
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('workspace_id')
            .eq('id', connectionId)
            .single();

        if (connError || !connection) {
            console.error(`[EmailProcessor] Connection not found: ${connectionId}`);
            throw new AppError(
                `Connection ${connectionId} not found`,
                'CONNECTION_NOT_FOUND',
                404
            );
        }

        const workspaceId = connection.workspace_id;

        // HARD GUARD: Reject if connection has no workspace_id
        if (!workspaceId) {
            console.error(`[EmailProcessor] Connection ${connectionId} has no workspace_id - cannot proceed`);
            throw new AppError(
                `Connection ${connectionId} has no workspace_id. Cannot create review items without workspace context.`,
                'CONNECTION_MISSING_WORKSPACE',
                400,
                'Ensure the connection is properly associated with a workspace before processing emails.'
            );
        }

        console.log(`[EmailProcessor] Using workspace_id=${workspaceId} from connection`);

        // 2. Fetch ALL stored Gmail messages - NO FILTER on processed_at
        const { data: emails, error: emailError } = await supabase
            .from('gmail_messages')
            .select('id, gmail_message_id, subject, snippet, raw_metadata, connection_id')
            .eq('connection_id', connectionId);

        if (emailError) {
            console.error(`[EmailProcessor] Error fetching gmail_messages:`, emailError);
            return { messages_scanned: 0, reservations_parsed: 0, review_items_created: 0, review_items_skipped: 0 };
        }

        if (!emails || emails.length === 0) {
            console.log(`[EmailProcessor] No stored Gmail messages found.`);
            return { messages_scanned: 0, reservations_parsed: 0, review_items_created: 0, review_items_skipped: 0 };
        }

        console.log(`[EmailProcessor] Found ${emails.length} stored Gmail messages to scan.`);

        // 3. Fetch ALL iCal-backed bookings for this workspace (to check matches)
        const { data: icalBookings } = await supabase
            .from('bookings')
            .select('id, check_in, check_out, reservation_code, source_feed_id, external_uid, raw_data')
            .eq('workspace_id', workspaceId)
            .not('source_feed_id', 'is', null); // Only iCal-backed bookings

        const icalBookingsList = icalBookings || [];
        console.log(`[EmailProcessor] Found ${icalBookingsList.length} iCal-backed bookings for matching.`);

        // 4. Fetch existing review items to check for duplicates (idempotency)
        const { data: existingReviewItems } = await supabase
            .from('enrichment_review_items')
            .select('id, extracted_data')
            .eq('workspace_id', workspaceId)
            .eq('connection_id', connectionId);

        // Build set of gmail_message_ids already in review
        const existingGmailIds = new Set<string>();
        if (existingReviewItems) {
            for (const item of existingReviewItems) {
                const gmailId = item.extracted_data?.gmail_message_id;
                if (gmailId) {
                    existingGmailIds.add(gmailId);
                }
            }
        }
        console.log(`[EmailProcessor] ${existingGmailIds.size} gmail_message_ids already in review items.`);

        let messagesScanned = 0;
        let reservationsParsed = 0;
        let reviewItemsCreated = 0;
        let reviewItemsSkipped = 0;

        // 5. Process each email
        for (const email of emails) {
            messagesScanned++;

            try {
                // RESERVATION CANDIDATE GATE
                // Check classification before any calendar matching
                const raw = email.raw_metadata || {};
                const classification = raw.classification;

                if (!classification?.is_reservation_candidate) {
                    // NOT a reservation candidate - skip calendar matching and review item creation
                    console.log(`[EmailProcessor] Skipping ${email.gmail_message_id}: ${classification?.message_type || 'unclassified'} (candidate=false)`);
                    continue;
                }

                // Prepare body for parsing
                let bodyToParse = '';
                if (raw.full_html) {
                    bodyToParse = raw.full_html
                        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<[^>]+>/g, '\n')
                        .replace(/&nbsp;/g, ' ');
                } else if (raw.full_text) {
                    bodyToParse = raw.full_text;
                } else if (raw.original_msg?.bodyText) {
                    bodyToParse = raw.original_msg.bodyText;
                } else {
                    bodyToParse = email.snippet || '';
                }

                // Parse reservation
                const fact = this.parseReservationEmail(bodyToParse, email.subject || '');
                if (!fact) {
                    // Not a reservation email, skip silently
                    continue;
                }

                // Validate
                const validationError = this.validateReservationFact(fact);
                if (validationError) {
                    console.warn(`[EmailProcessor] Validation failed for ${email.gmail_message_id}: ${validationError}`);
                    continue;
                }

                reservationsParsed++;
                console.log(`[EmailProcessor] Parsed reservation: ${fact.guest_name} (${fact.check_in}) code=${fact.confirmation_code}`);

                // 6. Check if matching iCal-backed booking exists
                let hasICalMatch = false;

                // A. Confirmation code match
                if (fact.confirmation_code) {
                    hasICalMatch = icalBookingsList.some(b =>
                        b.reservation_code === fact.confirmation_code ||
                        (b.raw_data && JSON.stringify(b.raw_data).includes(fact.confirmation_code)) ||
                        (b.external_uid && b.external_uid.includes(fact.confirmation_code))
                    );
                }

                // B. Exact date match (only if no code match)
                if (!hasICalMatch && fact.check_in && fact.check_out) {
                    hasICalMatch = icalBookingsList.some(b => {
                        const bIn = new Date(b.check_in).toISOString().split('T')[0];
                        const bOut = new Date(b.check_out).toISOString().split('T')[0];
                        return bIn === fact.check_in && bOut === fact.check_out;
                    });
                }

                if (hasICalMatch) {
                    console.log(`[EmailProcessor] iCal match found for ${fact.guest_name} - skipping review item`);
                    continue;
                }

                // 7. NO iCal match - Check idempotency via gmail_message_id
                if (existingGmailIds.has(email.gmail_message_id)) {
                    console.log(`[EmailProcessor] Review item already exists for gmail_message_id=${email.gmail_message_id}`);
                    reviewItemsSkipped++;
                    continue;
                }

                // 8. Create review item (NEVER create booking)
                // Table schema: workspace_id, connection_id, extracted_data, status
                console.warn(`[EmailProcessor] ⚠️ No iCal backing for: ${fact.guest_name} (${fact.check_in}) code=${fact.confirmation_code}`);

                const { error: insertError } = await supabase.from('enrichment_review_items').insert({
                    workspace_id: workspaceId,
                    connection_id: connectionId,
                    extracted_data: {
                        gmail_message_id: email.gmail_message_id,
                        guest_name: fact.guest_name,
                        check_in: fact.check_in,
                        check_out: fact.check_out,
                        guest_count: fact.guest_count,
                        confirmation_code: fact.confirmation_code,
                        listing_name: fact.listing_name
                    },
                    status: 'pending'
                });

                if (!insertError) {
                    reviewItemsCreated++;
                    existingGmailIds.add(email.gmail_message_id); // Track for idempotency within this run
                    console.log(`[EmailProcessor] ✅ Created review item for ${fact.guest_name}`);
                } else {
                    console.error(`[EmailProcessor] Failed to create review item:`, insertError);
                }

            } catch (err) {
                console.error(`[EmailProcessor] Error processing email ${email.gmail_message_id}:`, err);
            }
        }

        console.log(`[EmailProcessor] Reprocess Complete: Scanned=${messagesScanned}, Parsed=${reservationsParsed}, Created=${reviewItemsCreated}, Skipped=${reviewItemsSkipped}`);
        return {
            messages_scanned: messagesScanned,
            reservations_parsed: reservationsParsed,
            review_items_created: reviewItemsCreated,
            review_items_skipped: reviewItemsSkipped
        };
    }

    static parseReservationEmail(bodyRaw: string, subject: string, isCandidate = false, stats?: any): ExtractedFact | null {
        try {
            // Normalize body: collapse multiple spaces/newlines
            const body = bodyRaw.replace(/\s+/g, ' ').trim();

            // 1. Is it a reservation? (Skip if already classified as candidate)
            const strictSubjectRegex = /Reservation|Booking|Confirmed|Itinerary/i;
            const broadSubjectRegex = /New request|New inquiry|Payment received/i;

            if (!isCandidate && !strictSubjectRegex.test(subject) && !broadSubjectRegex.test(subject)) {
                if (stats) stats.parse_fail_subject++;
                return null;
            }

            let guest_name: string | null = null;
            let check_in = '';
            let check_out = '';
            let guest_count: number | null = null;

            // =====================================================================
            // 2. GUEST NAME EXTRACTION (Strict - subject only with cleaning)
            // =====================================================================

            // A. Lodgify Pattern: "New Confirmed Booking: [Name] (2 Nights, Arrival: Jan 25)"
            const lodgifyMatch = subject.match(/(?:Booking|received):\s+([^(,\-#]+)/i);
            if (lodgifyMatch) {
                guest_name = this.cleanGuestName(lodgifyMatch[1]);
            }

            // B. Airbnb/VRBO Pattern: "Reservation confirmed - [Name] arrives..."
            if (!guest_name) {
                const airbnbMatch = subject.match(/(?:Reservation|Booking)\s+(?:confirmed|from)\s*[-:]\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
                if (airbnbMatch) {
                    guest_name = this.cleanGuestName(airbnbMatch[1]);
                }
            }

            // C. Body fallback: Look for "Guest: [Name]" or "Name: [Name]" patterns
            if (!guest_name) {
                const bodyNamePatterns = [
                    /Guest(?:\s+name)?:\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                    /Booked by:\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                    /Name:\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                ];
                for (const pattern of bodyNamePatterns) {
                    const match = body.match(pattern);
                    if (match) {
                        guest_name = this.cleanGuestName(match[1]);
                        if (guest_name) break;
                    }
                }
            }

            // =====================================================================
            // 3. DATES EXTRACTION (TEMPORARY - used for matching only)
            // NOTE: These dates are used to match facts to bookings during enrichment.
            // The authoritative dates come from iCal sync and will overwrite these
            // when enrichBookings() successfully matches a fact to a booking.
            // =====================================================================

            const currentYear = new Date().getFullYear();

            // Helper: parse a date string like "Feb 8", "Jan 25, 2026", "Feb 21 2026"
            const parseDate = (str: string): string | null => {
                const m = str.match(/([A-Za-z]{3,9})\s+(\d{1,2})(?:[,\s]+(\d{4}))?/);
                if (!m) return null;
                const d = new Date(`${m[1]} ${m[2]}, ${m[3] || currentYear}`);
                if (isNaN(d.getTime())) return null;
                return d.toISOString().split('T')[0];
            };

            // A. Lodgify Subject: "... (3 Nights, Arrival: Jan 25 2026) ..."
            if (subject.includes('Arrival:')) {
                const arrivalMatch = subject.match(/Arrival:\s+([A-Za-z]+\s+\d+(?:,\s*\d{4}|\s+\d{4})?)/i);
                if (arrivalMatch) {
                    check_in = parseDate(arrivalMatch[1]) || '';
                    if (check_in) {
                        const nightsMatch = subject.match(/(\d+)\s+Nights?/i);
                        const nights = nightsMatch ? parseInt(nightsMatch[1]) : 1;
                        const outDate = new Date(check_in + 'T12:00:00');
                        outDate.setDate(outDate.getDate() + nights);
                        check_out = outDate.toISOString().split('T')[0];
                    }
                }
            }

            // B. Airbnb Subject: "... arrives Feb 6"
            if (!check_in) {
                const subjectDateMatch = subject.match(/arrives\s+([A-Za-z]+)\s+(\d{1,2})/i);
                if (subjectDateMatch) {
                    check_in = parseDate(`${subjectDateMatch[1]} ${subjectDateMatch[2]}`) || '';
                }
            }

            // C. Body: "Check-in ... Checkout ..." (Airbnb format)
            //    Pattern: "Check-in Sun, Feb 6 4:00 PM Checkout Mon, Feb 8 11:00 AM"
            if (!check_in || !check_out) {
                // Airbnb body: "Check-in DayOfWeek, Month DD Time Checkout DayOfWeek, Month DD Time"
                const airbnbDatePattern = /Check-?in\s+(?:[A-Za-z]{3},?\s+)?([A-Za-z]{3,9})\s+(\d{1,2})(?:[,\s]+(\d{4}))?\s+\d{1,2}:\d{2}\s*[AP]M\s+Check-?out\s+(?:[A-Za-z]{3},?\s+)?([A-Za-z]{3,9})\s+(\d{1,2})(?:[,\s]+(\d{4}))?\s+\d{1,2}:\d{2}\s*[AP]M/i;
                const airbnbMatch = body.match(airbnbDatePattern);
                if (airbnbMatch) {
                    if (!check_in) {
                        check_in = parseDate(`${airbnbMatch[1]} ${airbnbMatch[2]}${airbnbMatch[3] ? ', ' + airbnbMatch[3] : ''}`) || '';
                    }
                    if (!check_out) {
                        check_out = parseDate(`${airbnbMatch[4]} ${airbnbMatch[5]}${airbnbMatch[6] ? ', ' + airbnbMatch[6] : ''}`) || '';
                    }
                }
            }

            // D. Body: "Departure: Feb 21 2026" (Lodgify format)
            if (!check_out) {
                const departureMatch = body.match(/Departure:\s+([A-Za-z]{3,9}\s+\d{1,2}(?:[,\s]+\d{4})?)/i);
                if (departureMatch) {
                    check_out = parseDate(departureMatch[1]) || '';
                }
            }

            // E. Body: "Check-out" / "Checkout" section (generic)
            if (!check_out) {
                const checkoutAnchors = ['Check-out', 'Checkout', 'check-out', 'checkout'];
                for (const anchor of checkoutAnchors) {
                    const idx = body.indexOf(anchor);
                    if (idx !== -1) {
                        // Grab text after the anchor, skip day-of-week if present
                        const afterAnchor = body.substring(idx + anchor.length, idx + anchor.length + 100);
                        // Match: optional "DayOfWeek, " then "Month DD" with optional year and time
                        const m = afterAnchor.match(/\s*(?:[A-Za-z]{3,9},?\s+)?([A-Za-z]{3,9})\s+(\d{1,2})(?:[,\s]+(\d{4}))?/);
                        if (m) {
                            const parsed = parseDate(`${m[1]} ${m[2]}${m[3] ? ', ' + m[3] : ''}`);
                            if (parsed) {
                                check_out = parsed;
                                break;
                            }
                        }
                    }
                }
            }

            // F. Body: "Check-in" section for check_in (generic fallback)
            if (!check_in) {
                const checkinAnchors = ['Check-in', 'check-in', 'Checkin', 'checkin'];
                for (const anchor of checkinAnchors) {
                    const idx = body.indexOf(anchor);
                    if (idx !== -1) {
                        const afterAnchor = body.substring(idx + anchor.length, idx + anchor.length + 100);
                        const m = afterAnchor.match(/\s*(?:[A-Za-z]{3,9},?\s+)?([A-Za-z]{3,9})\s+(\d{1,2})(?:[,\s]+(\d{4}))?/);
                        if (m) {
                            const parsed = parseDate(`${m[1]} ${m[2]}${m[3] ? ', ' + m[3] : ''}`);
                            if (parsed) {
                                check_in = parsed;
                                break;
                            }
                        }
                    }
                }
            }


            // G. Body: "Arrival:" (Lodgify template fallback)
            if (!check_in) {
                const lodgifyArrival = body.match(/Arrival:\s+([A-Za-z]{3,9}\s+\d{1,2}(?:[,\s]+\d{4})?)/i);
                if (lodgifyArrival) {
                    check_in = parseDate(lodgifyArrival[1]) || '';
                }
            }

            // NOTE: If check_out is still empty here, the fact will be stored without it.
            // The existing review inbox flow in processMessages() will flag facts
            // that cannot match a booking, so the user can resolve manually.

            // =====================================================================
            // 4. GUEST COUNT EXTRACTION (from body, default to 1 if not found)
            // =====================================================================
            const guestCountPatterns = [
                /(?:Total\s+)?Guests?:\s*(\d+)/i,
                /(\d+)\s+Guests?(?:\s|$|,)/i,
                /Party\s+size:\s*(\d+)/i,
                /Number\s+of\s+guests?:\s*(\d+)/i,
                /Adults?:\s*(\d+)/i,
                /Travelers?:\s*(\d+)/i,
                /(\d+)\s+adult/i,
                /Occupancy:\s*(\d+)/i,
            ];

            for (const pattern of guestCountPatterns) {
                const match = body.match(pattern);
                if (match) {
                    const count = parseInt(match[1]);
                    if (count >= 1 && count <= 30) {
                        guest_count = count;
                        break;
                    }
                }
            }

            // Default to 1 if not found (better than NULL for display)
            if (guest_count === null) {
                guest_count = 1;
            }

            // =====================================================================
            // 5. CONFIRMATION CODE (unchanged)
            // =====================================================================
            let confirmation_code = '';
            const lodgifyCode = subject.match(/#([A-Z0-9]{8,15})/i);
            if (lodgifyCode) {
                confirmation_code = lodgifyCode[1];
            } else {
                const codeMatch = body.match(/(?:Confirmation code|Reservation ID).*?([A-Z0-9]{8,15})/i);
                if (codeMatch) confirmation_code = codeMatch[1];
            }

            // Listing Name
            let listing_name = 'Short-term Rental';

            // =====================================================================
            // 6. VALIDATION & RETURN
            // =====================================================================
            if (!check_in) {
                if (stats) stats.parse_fail_dates++;
                return null;
            }

            if (!guest_name) {
                if (stats) stats.parse_fail_name_missing++;
                // Still return fact with null guest_name - it has valid dates
                // Enrichment can fill this later, or calendar will show dates without name
            }

            const confidence = (check_in && guest_name) ? 0.9 : 0.5;

            return {
                check_in,
                check_out,
                guest_name,           // null if not cleanly extracted
                guest_count,          // null if not found (never defaulted to 1)
                confirmation_code,
                listing_name,
                confidence
            };

        } catch (err: any) {
            console.error(`[EmailProcessor] Parse Error: ${err.message}`);
            if (stats) stats.parse_fail_error++;
            return null;
        }
    }

    /**
     * Clean and validate a guest name extracted from email.
     * Returns null if the name looks invalid (contains action words, is a placeholder, etc.)
     */
    private static cleanGuestName(rawName: string): string | null {
        if (!rawName) return null;

        let name = rawName.trim();

        // Strip common trailing patterns (the main problem - "arrives Jan 25" suffix)
        name = name
            .replace(/\s+arrives\s+.*$/i, '')      // "John arrives Jan 25" -> "John"
            .replace(/\s+check-?in\s+.*$/i, '')    // "John check-in Jan 25" -> "John"
            .replace(/\s+checking\s+.*$/i, '')
            .replace(/\s+for\s+\d+.*$/i, '')
            .replace(/\s+\d+\s*nights?.*$/i, '')
            .replace(/\s*[-–—]\s*$/, '')
            .trim();

        // Strip leading patterns
        name = name
            .replace(/^(?:new\s+)?(?:confirmed\s+)?booking\s*[-:]\s*/i, '')
            .replace(/^reservation\s*[-:]\s*/i, '')
            .trim();

        // Only reject EXACT forbidden placeholder names (not as substrings)
        const forbiddenNames = ['guest', 'reserved', 'unknown', 'empty', 'not available', 'blocked', 'n/a', 'airbnb', 'vrbo'];
        if (forbiddenNames.includes(name.toLowerCase())) {
            return null;
        }

        // Must be at least 2 characters
        if (name.length < 2) {
            return null;
        }

        // Allow names with letters, spaces, hyphens, and apostrophes (O'Brien, Mary-Jane)
        if (!/^[A-Za-z][A-Za-z'\-\s]*[A-Za-z]$/.test(name) && name.length > 2) {
            // If it doesn't look like a name but is long, still return it (might be valid)
            // Only reject if it starts with a digit or contains obviously bad patterns
            if (/^\d/.test(name) || /\d{4}/.test(name)) {
                return null;
            }
        }

        return name;
    }
}
