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
            msgsToProcess = await this.fetchGmailMessages(connectionId, label);
        }

        console.log(`[EmailProcessor] Processing ${msgsToProcess.length} messages`);

        let parsedCount = 0;
        let skippedCount = 0;
        const skipReasons: Record<string, number> = {};

        for (const msg of msgsToProcess) {
            try {
                // Check dupes
                const { data: existing } = await supabase
                    .from('gmail_messages')
                    .select('id')
                    .eq('gmail_message_id', msg.id)
                    .single();

                if (existing) {
                    console.log(`[EmailProcessor] Skipping duplicate message ${msg.id}`);
                    skipReasons['duplicate'] = (skipReasons['duplicate'] || 0) + 1;
                    skippedCount++;
                    continue;
                }

                // Parse (Anchored)
                // We pass both HTML and Text if available. 
                // Currently strictly relying on Text derived from HTML or Plain Text for regex anchors, 
                // but might strip tags if needed. For now let's use the text version for regexing.
                // If we have HTML, we might want to strip tags to get clean text for anchoring.
                // A simple tag stripper:
                const textToParse = msg.bodyHtml ?
                    msg.bodyHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ')
                    : msg.bodyText;

                const fact = this.parseReservationEmail(textToParse, msg.subject);

                if (!fact) {
                    console.warn(`[EmailProcessor] Failed to parse message ${msg.id} (Not a reservation or parse error)`);
                    skipReasons['parse_failed'] = (skipReasons['parse_failed'] || 0) + 1;
                    skippedCount++;
                    continue;
                }

                // Validate
                const validationError = this.validateReservationFact(fact);
                if (validationError) {
                    console.warn(`[EmailProcessor] Validation failed for ${msg.id}: ${validationError}`);
                    skipReasons['validation_failed'] = (skipReasons['validation_failed'] || 0) + 1;
                    skippedCount++;
                    continue;
                }

                parsedCount++;

                // Store in gmail_messages
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
                    continue;
                }

                // Store in reservation_facts if future/current
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
                        results.push(fact);
                    }
                } else {
                    console.log(`[EmailProcessor] Parsed past reservation, storing msg but skipping facts table.`);
                }

            } catch (err: any) {
                console.error(`[EmailProcessor] Error processing message ${msg.id}:`, err);
                skipReasons['error'] = (skipReasons['error'] || 0) + 1;
                skippedCount++;
            }
        }

        console.log(`[EmailProcessor] Processing Summary: Parsed=${parsedCount}, Skipped=${skippedCount}`);
        return results;
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

                    if (!existingReview) {
                        console.warn(`[EmailProcessor] ⚠️ Booking Missing from Calendar: ${fact.guest_name} (${fact.check_in}) code=${fact.confirmation_code}`);

                        await supabase.from('enrichment_review_items').insert({
                            connection_id: connectionId,
                            item_type: 'BOOKING_MISSING_FROM_CALENDAR',
                            raw_content: `Booking for ${fact.guest_name} on ${fact.check_in} (Code: ${fact.confirmation_code}) found in email but missing from calendar.`,
                            extracted_data: fact,
                            confidence_score: 0.9,
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

    static parseReservationEmail(bodyRaw: string, subject: string): ExtractedFact | null {
        try {
            // Normalize body: collapse multiple spaces/newlines
            const body = bodyRaw.replace(/\s+/g, ' ').trim();

            // 1. Is it a reservation?
            if (!/Reservation confirmed|Booking confirmed/i.test(subject)) {
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
