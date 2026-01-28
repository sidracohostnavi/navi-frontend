import { createClient } from '@/lib/supabase/server';
import { getGoogleOAuthClient } from '@/lib/utils/google';
import { google } from 'googleapis';

type ExtractedFact = {
    check_in: string;
    check_out: string;
    guest_name: string;
    guest_count: number;
    confirmation_code: string;
    listing_name: string;
    confidence: number;
    raw?: any;
};

import { AppError } from '@/lib/utils/api-errors';

export class EmailProcessor {
    static async fetchGmailMessages(connectionId: string, label: string) {
        const supabase = await createClient();

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

        // 2. Search using Label ID
        // Note: We search for *all* messages in the label, then filter/parse in the loop.
        // This ensures stricter "Reservation confirmed" checks happen in our code, not just Gmail's index.
        const listRes = await gmail.users.messages.list({
            userId: 'me',
            labelIds: [targetLabel.id],
            maxResults: 20
        });

        const messages = listRes.data.messages || [];
        console.log(`[EmailProcessor] Messages found: ${messages.length}`);

        if (messages.length === 0) {
            return [];
        }

        return this.fetchDetails(gmail, messages);
    }

    private static async fetchDetails(gmail: any, messages: any[]) {
        const messageDetails = [];
        for (const msgStub of messages) {
            if (!msgStub.id) continue;

            const detail = await gmail.users.messages.get({
                userId: 'me',
                id: msgStub.id,
                format: 'full'
            });

            const payload = detail.data.payload;
            const headers = payload?.headers || [];
            const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
            const snippet = detail.data.snippet || '';

            // Extract Body: Prefer HTML, then Text, then Snippet
            let bodyHtml = '';
            let bodyText = '';

            const getPart = (parts: any[], mimeType: string) => {
                return parts.find(p => p.mimeType === mimeType);
            };

            const decode = (data: string) => Buffer.from(data, 'base64').toString('utf-8');

            if (payload?.body?.data) {
                // If message has no parts, body is in payload
                if (payload.mimeType === 'text/html') {
                    bodyHtml = decode(payload.body.data);
                } else {
                    bodyText = decode(payload.body.data);
                }
            } else if (payload?.parts) {
                // DFS for parts (simple version for now)
                let parts = payload.parts;

                // Sometimes parts are nested in 'multipart/alternative'
                const alternative = parts.find((p: any) => p.mimeType === 'multipart/alternative');
                if (alternative?.parts) {
                    parts = alternative.parts;
                }

                const htmlPart = getPart(parts, 'text/html');
                const textPart = getPart(parts, 'text/plain');

                if (htmlPart?.body?.data) bodyHtml = decode(htmlPart.body.data);
                if (textPart?.body?.data) bodyText = decode(textPart.body.data);
            }

            messageDetails.push({
                id: detail.data.id || msgStub.id,
                subject,
                snippet,
                bodyText: bodyText || snippet,
                bodyHtml: bodyHtml
            });
        }
        return messageDetails;
    }

    static async processMessages(connectionId: string, messages?: any[]) {
        const supabase = await createClient();
        const results = [];
        let msgsToProcess = messages || [];

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

            msgsToProcess = await this.fetchGmailMessages(connectionId, label);
        }

        console.log(`[EmailProcessor] Processing ${msgsToProcess.length} messages`);

        let parsedCount = 0;
        let skippedCount = 0;
        const skipReasons: Record<string, number> = {};

        for (const msg of msgsToProcess) {
            try {
                // 1. ISOLATION & DEDUPE CHECK
                // Check if this message exists ANYWHERE in the system
                const { data: existingRows } = await supabase
                    .from('gmail_messages')
                    .select('connection_id')
                    .eq('gmail_message_id', msg.id);

                if (existingRows && existingRows.length > 0) {
                    // Check ownership
                    const ownedByMe = existingRows.some(row => row.connection_id === connectionId);

                    if (ownedByMe) {
                        // Idempotency: I already processed it.
                        console.log(`[EmailProcessor] Skipping duplicate message ${msg.id} (Idempotent)`);
                        skipReasons['duplicate_self'] = (skipReasons['duplicate_self'] || 0) + 1;
                        skippedCount++;
                        continue;
                    } else {
                        // Isolation Violation: Someone else processed it!
                        // Fail-Fast: Use explicit error formatting
                        // HARD STOP
                        throw new AppError(
                            `Message ${msg.id} already processed by another connection.`,
                            'CROSS_CONNECTION_MESSAGE_SEEN',
                            409,
                            'Check for duplicate connections sharing the same label in this workspace.',
                            {
                                gmail_message_id: msg.id,
                                owner_connection_ids: existingRows.map(r => r.connection_id)
                            }
                        );
                    }
                }

                // 2. STORE RAW MESSAGE (Ingestion Source of Truth)
                // We store the message *before* parsing so we never lose data.
                const { error: msgError } = await supabase
                    .from('gmail_messages')
                    .insert({
                        gmail_message_id: msg.id,
                        connection_id: connectionId,
                        subject: msg.subject,
                        snippet: msg.snippet,
                        raw_metadata: {
                            full_text: msg.bodyText,
                            full_html: msg.bodyHtml, // Storing HTML for future debugging
                            original_msg: msg // Keep everything just in case
                        },
                        processed_at: new Date().toISOString()
                    });

                if (msgError) {
                    console.error(`[EmailProcessor] Error storing message ${msg.id}:`, msgError);
                    // If we can't store the raw message, we shouldn't proceed with parsing logic 
                    // to avoid "fact without message" (though fact schema separates them).
                    // But mostly because of partial failure states.
                    skipReasons['store_failed'] = (skipReasons['store_failed'] || 0) + 1;
                    continue;
                }

                // 3. PARSE (Attempt to extract Reservation Facts)
                const textToParse = msg.bodyHtml ?
                    msg.bodyHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ')
                    : msg.bodyText;

                const fact = this.parseReservationEmail(textToParse, msg.subject);

                if (!fact) {
                    // It's saved in gmail_messages, but we couldn't parse facts.
                    // This is fine. It might be a chat message or just hard to parse.
                    console.log(`[EmailProcessor] Stored message ${msg.id} but could not parse facts (Subject: "${msg.subject}")`);
                    parsedCount++; // We successfully "processed" (ingested) it.
                    continue;
                }

                // Validate Fact
                const validationError = this.validateReservationFact(fact);
                if (validationError) {
                    console.warn(`[EmailProcessor] Validation failed for ${msg.id}: ${validationError}`);
                    // Still counted as processed/ingested.
                    parsedCount++;
                    continue;
                }

                // 4. STORE FACTS
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const checkInDate = new Date(fact.check_in);

                if (checkInDate >= today) {
                    const { error: factError } = await supabase
                        .from('reservation_facts')
                        .insert({
                            source_gmail_message_id: msg.id,
                            connection_id: connectionId,
                            check_in: fact.check_in,
                            check_out: fact.check_out,
                            guest_name: fact.guest_name,
                            guest_count: fact.guest_count,
                            confirmation_code: fact.confirmation_code,
                            listing_name: fact.listing_name,
                            confidence: fact.confidence,
                            raw_data: fact.raw
                        });

                    if (factError) {
                        console.error(`[EmailProcessor] Error storing fact:`, factError);
                    } else {
                        // Ensure we count facts if needed? 
                        // Actually 'parsedCount' tracks ingestion.
                        // results.push(fact) is useful for immediate return if caller needs it.
                        results.push(fact);
                    }
                } else {
                    console.log(`[EmailProcessor] Parsed past reservation, storing msg but skipping facts table.`);
                }
            } catch (err: any) {
                // If it's a cross-connection violation, re-throw to abort
                if (err instanceof AppError && err.code === 'CROSS_CONNECTION_MESSAGE_SEEN') {
                    throw err;
                }

                console.error(`[EmailProcessor] Error processing message ${msg.id}:`, err);
                skipReasons['error'] = (skipReasons['error'] || 0) + 1;
                skippedCount++;
            }
        }

        console.log(`[EmailProcessor] Processing Summary: Parsed=${parsedCount}, Skipped=${skippedCount}`);

        // Audit Log for Run
        console.log(JSON.stringify({
            event: 'gmail_ingest_run',
            connection_id: connectionId,
            messages_found: msgsToProcess.length,
            messages_processed: parsedCount,
            messages_skipped: skippedCount,
            skip_reasons: skipReasons
        }));

        return results;
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
        // Guest Count 1-12
        if (fact.guest_count < 1 || fact.guest_count > 12) return `Invalid guest count: ${fact.guest_count}`;

        // Block bad guest names
        const badNames = /service|fee|tax|airbnb|admin/i;
        if (badNames.test(fact.guest_name)) return `Invalid guest name: ${fact.guest_name}`;

        // Check dates
        if (new Date(fact.check_in) >= new Date(fact.check_out)) return `Invalid dates: ${fact.check_in} >= ${fact.check_out}`;

        // Confirmation code
        if (!/^[A-Z0-9]{8,15}$/.test(fact.confirmation_code)) return `Invalid confirmation code: ${fact.confirmation_code}`;

        return null;
    }

    static async enrichBookings(connectionId: string) {
        const supabase = await createClient();
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
            .eq('id', connectionId)
            .single();

        const workspaceId = connection?.workspace_id;

        // 2. Resolve Properties
        const { data: connProps } = await supabase
            .from('connection_properties')
            .select('property_id')
            .eq('connection_id', connectionId);

        const propertyIds = connProps ? connProps.map(cp => cp.property_id) : [];
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
                targetBooking = candidateBookings.find(b =>
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

                const dateMatches = candidateBookings.filter(b => {
                    const bIn = new Date(b.check_in).toISOString().split('T')[0];
                    const bOut = new Date(b.check_out).toISOString().split('T')[0];
                    return bIn === factIn && bOut === factOut;
                });

                if (dateMatches.length === 1) {
                    targetBooking = dateMatches[0];
                    matchReason = 'Unique Date';
                } else if (dateMatches.length > 1) {
                    // Check Property Ambiguity
                    const distinctProps = new Set(dateMatches.map(b => b.property_id));
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
                // CRITICAL SAFETY RULE:
                // - Email enrichment ONLY updates guest metadata (name, count)
                // - NEVER modifies property_id (comes from iCal feed only)
                // - NEVER creates new bookings (UPDATE only, no INSERT/UPSERT)
                // - Property assignment is determined exclusively by iCal sync

                // Enrich (Re-hydration)
                const firstName = fact.guest_name.split(' ')[0];
                const lastInitial = fact.guest_name.split(' ').length > 1 ? fact.guest_name.split(' ').pop()?.replace('.', '') : '';
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

        // 1. Fetch workspace_id via connection -> user_id -> workspace membership
        const { data: connection } = await supabase
            .from('connections')
            .select('user_id')
            .eq('id', connectionId)
            .single();

        if (!connection?.user_id) {
            console.warn(`[EmailProcessor] No user found for connection ${connectionId}`);
            return { messages_scanned: 0, reservations_parsed: 0, review_items_created: 0, review_items_skipped: 0 };
        }

        // Look up workspace from user membership
        const { data: membership } = await supabase
            .from('cohost_workspace_members')
            .select('workspace_id')
            .eq('user_id', connection.user_id)
            .limit(1)
            .maybeSingle();

        // Fallback: get workspace from existing bookings if no membership
        let workspaceId = membership?.workspace_id;
        if (!workspaceId) {
            const { data: sampleBooking } = await supabase
                .from('bookings')
                .select('workspace_id')
                .limit(1)
                .single();
            workspaceId = sampleBooking?.workspace_id;
        }

        if (!workspaceId) {
            console.warn(`[EmailProcessor] No workspace found for connection ${connectionId}`);
            return { messages_scanned: 0, reservations_parsed: 0, review_items_created: 0, review_items_skipped: 0 };
        }

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
                // Prepare body for parsing
                const raw = email.raw_metadata || {};
                let bodyToParse = '';
                if (raw.full_html) {
                    bodyToParse = raw.full_html
                        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<[^>]+>/g, '\n')
                        .replace(/&nbsp;/g, ' ');
                } else if (raw.full_text) {
                    bodyToParse = raw.full_text;
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

    static parseReservationEmail(bodyRaw: string, subject: string): ExtractedFact | null {
        try {
            // Normalize body: collapse multiple spaces/newlines
            const body = bodyRaw.replace(/\s+/g, ' ').trim();

            // 1. Is it a reservation?
            // Broaden to include Airbnb, VRBO, Lodgify, and direct booking patterns
            if (!/Reservation|Booking|Confirmed/i.test(subject)) {
                return null;
            }

            console.log(`[EmailProcessor] Anchored Parsing for: ${subject}`);

            // 2. Guest Name (From Subject: "Reservation confirmed - Liz Servin arrives Jan 25")
            // Airbnb Subject: "Reservation confirmed - Guest Name arrives..."
            let guest_name = 'Guest';
            const subjectMatch = subject.match(/[–-]\s*([^–-]+?)\s+arrives/i);
            if (subjectMatch) {
                const fullName = subjectMatch[1].trim();
                const parts = fullName.split(' ');
                if (parts.length >= 2) {
                    guest_name = `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
                } else {
                    guest_name = fullName;
                }
            }

            // 3. Anchors
            // We search for the *Heading* then the content closely following it.
            // Since we stripped HTML to newlines/spaces, we look for "Header Value"

            const extractSection = (anchor: string, nextAnchorPattern?: RegExp): string => {
                const anchorIdx = body.toLowerCase().indexOf(anchor.toLowerCase());
                if (anchorIdx === -1) return '';

                // Content roughly starts after anchor
                const contentStart = anchorIdx + anchor.length;
                let contentChunk = body.substring(contentStart, contentStart + 200); // 200 chars context

                // Stop at next section if we can identify it, otherwise just take a chunk
                if (nextAnchorPattern) {
                    const match = contentChunk.match(nextAnchorPattern);
                    if (match && match.index !== undefined) {
                        contentChunk = contentChunk.substring(0, match.index);
                    }
                }

                return contentChunk.trim();
            };

            // Check-in
            // Pattern: "Check-in" ... "Sun, Jan 25" or "Jan 25"
            // We look for a date pattern in the chunk after "Check-in"
            // Validation: must not contain $
            const checkInChunk = extractSection('Check-in');
            const dateRegex = /([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?/;
            // e.g. Jan 25 or Jan 25, 2026

            // 1. Try Subject Match first
            let check_in = '';
            console.log(`[EmailProcessor] Checking subject for date: "${subject}"`);
            const subjectDateMatch = subject.match(/arrives\s+([A-Za-z]+)\s+(\d{1,2})/i);
            if (subjectDateMatch) {
                const currentYear = new Date().getFullYear();
                const ds = `${subjectDateMatch[1]} ${subjectDateMatch[2]}, ${currentYear}`;
                const d = new Date(ds);
                if (!isNaN(d.getTime())) {
                    check_in = d.toISOString().split('T')[0];
                    console.log(`[EmailProcessor] Found date in subject: ${check_in}`);
                }
            }

            let check_out = '';

            const parseDate = (chunk: string): string => {
                const m = chunk.match(dateRegex);
                if (!m) return '';
                const month = m[1];
                const day = m[2];
                const year = m[3] || new Date().getFullYear().toString();
                const d = new Date(`${month} ${day}, ${year}`);
                if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
                return '';
            };

            const bodyDate = parseDate(checkInChunk);
            if (bodyDate) {
                check_in = bodyDate;
                console.log(`[EmailProcessor] Found date in body anchor: ${bodyDate}`);
            }

            // Checkout
            const checkOutChunk = extractSection('Checkout');
            check_out = parseDate(checkOutChunk);

            // Guests
            // Anchor: "Guests" -> "1 adult"
            const guestsChunk = extractSection('Guests');
            let guest_count = 1;
            const gcMatch = guestsChunk.match(/^(\d+)\s*(?:adult|guest)/i);
            if (gcMatch) {
                guest_count = parseInt(gcMatch[1], 10);
            }

            // Listing Name
            // Harder. Usually the first line of text after "Reservation confirmed" header or image.
            // In our collapsed text, it might be right after the subject line or near the top.
            // Strategy: Look for "Reservation confirmed" in body, then take the next significant text block that isn't a date or code.
            // OR use the specific prompt instruction: "first title block after header"
            // Let's try to find text that is NOT price/date/guest.
            // Actually, extraction from Subject might be safer if Listing name isn't there.
            // Let's use a heuristic: Find "Hosted by" and look *before* it? Or "Entire home in..."
            // Prompt says: "Listing name: first title block after header (must NOT contain $)"
            // Let's try: searching for the text between "Reservation confirmed" and "Check-in"

            let listing_name = 'Airbnb Stay';
            const rcIdx = body.toLowerCase().indexOf('reservation confirmed');
            const ciIdx = body.toLowerCase().indexOf('check-in');
            if (rcIdx !== -1 && ciIdx !== -1 && ciIdx > rcIdx) {
                const block = body.substring(rcIdx + 21, ciIdx).trim();
                // Filter out lines with $ or "tax"
                const cleanBlock = block.split(/\s+/).filter(w => !w.includes('$') && !w.toLowerCase().includes('tax')).join(' ');
                // Take first 50 chars?
                // This is fuzzy. Let's look for a specific string limit.
                // Or just:
                const possibleName = block.split('\n')[0].substring(0, 60).trim();
                if (possibleName && !possibleName.includes('$')) {
                    listing_name = possibleName;
                }
            }

            // Confirmation Code
            // Anchor: "Confirmation code" -> "HM..."
            const codeChunk = extractSection('Confirmation code');
            let confirmation_code = '';
            const codeMatch = codeChunk.match(/([A-Z0-9]{8,15})/);
            if (codeMatch) {
                confirmation_code = codeMatch[1];
            } else {
                // Fallback: Subject
                const subCode = subject.match(/([A-Z0-9]{10})/); // HM codes are usually 10
                if (subCode) confirmation_code = subCode[1];
            }

            // Fallback for year logic (next year if month < current month)
            const adjustYear = (dStr: string) => {
                if (!dStr) return '';
                const d = new Date(dStr);
                const now = new Date();
                // If date is in the past (e.g. Jan 1 parsed as this year, but we are in June), add year?
                // Actually the standard is usually strict year or verify against "now".
                // If we extracted a year, trust it. If not (defaulted to current), check logic.
                // Assuming Airbnb emails usually send current year or future.
                return dStr;
            };

            return {
                check_in: adjustYear(check_in),
                check_out: adjustYear(check_out),
                guest_name,
                guest_count,
                confirmation_code,
                listing_name,
                confidence: 1.0,
                raw: { body_snippet: body.substring(0, 200) }
            };

        } catch (err) {
            console.error('[EmailProcessor] Parse Error', err);
            return null;
        }
    }
}
