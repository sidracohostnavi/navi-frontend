/**
 * MessageProcessor
 *
 * Builds the host inbox by working booking-first:
 *   1. Fetch active/future bookings that have an enriched_guest_name
 *      (the name comes from the reservation confirmation email, so it
 *       matches exactly how the platform writes it in relay subjects)
 *   2. For each booking, search gmail_messages for relay emails whose
 *      subject contains that guest's name
 *   3. Classify only those few emails to confirm they are guest messages
 *   4. Write cohost_conversations + cohost_messages rows
 *
 * Called by POST /api/cohost/messaging/backfill  (one-click host import)
 * and by the enrichment cron for ongoing new messages.
 */

import { createClient } from '@/lib/supabase/server';
import { classifyEmail } from '@/lib/services/email-classifier';
import { DraftGeneratorService } from '@/lib/services/draft-generator';

export type MessageProcessorResult = {
    processed: number;
    conversations_created: number;
    messages_created: number;
    no_match: number;
    errors: number;
    has_more?: boolean;
};

export type BackfillResult = {
    conversations_created: number;
    messages_created: number;
    bookings_processed: number;
    bookings_no_name: number;
};

export class MessageProcessor {

    /**
     * Backfill entry point — booking-first approach.
     *
     * Iterates over active/future bookings that have a known guest name,
     * searches gmail_messages for relay emails matching that name,
     * and creates conversation + message rows.
     *
     * Safe to call repeatedly — already-imported messages are skipped.
     */
    static async backfillForWorkspace(
        workspaceId: string,
        supabaseClient?: any
    ): Promise<BackfillResult> {
        const supabase = supabaseClient || await createClient();
        const stats: BackfillResult = {
            conversations_created: 0,
            messages_created: 0,
            bookings_processed: 0,
            bookings_no_name: 0,
        };

        console.log(`[MessageProcessor] ===== BACKFILL FOR WORKSPACE ${workspaceId} =====`);

        // 1. Gmail connections for this workspace.
        //    Also include workspace_id = NULL (legacy connections created before migration 040
        //    added the column). RLS already ensures we only see this user's own connections.
        const { data: connections } = await supabase
            .from('connections')
            .select('id')
            .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
            .eq('gmail_status', 'connected');

        if (!connections?.length) {
            console.log('[MessageProcessor] No connected Gmail accounts');
            return stats;
        }
        const connectionIds: string[] = connections.map((c: any) => c.id);

        // 2. Properties linked to those connections
        const { data: connProps } = await supabase
            .from('connection_properties')
            .select('property_id')
            .in('connection_id', connectionIds);

        const propertyIds: string[] = [
            ...new Set<string>((connProps || []).map((cp: any) => cp.property_id as string))
        ];

        if (!propertyIds.length) {
            // Fallback: no connection_properties rows — query all properties in the workspace.
            // This handles the case where Gmail was connected before property mapping was set up.
            console.log('[MessageProcessor] No connection_properties rows — falling back to all workspace properties');
            const { data: wsProps } = await supabase
                .from('cohost_properties')
                .select('id')
                .eq('workspace_id', workspaceId);

            if (!wsProps?.length) {
                console.log('[MessageProcessor] No properties found in workspace');
                return stats;
            }
            propertyIds.push(...wsProps.map((p: any) => p.id));
        }

        // 3. Active / future bookings that have a known guest name.
        //    enriched_guest_name is written by EmailProcessor.enrichBookings() from
        //    the reservation confirmation email — same platform, same name format
        //    as the relay subject "John Smith sent you a message".
        //    Filter out the "Not Available" placeholder written when a name couldn't be parsed.
        const today = new Date().toISOString().split('T')[0];
        const { data: bookings } = await supabase
            .from('bookings')
            .select('id, enriched_guest_name, check_in, check_out, property_id, workspace_id')
            .in('property_id', propertyIds)
            .eq('is_active', true)
            .neq('status', 'cancelled')
            .gte('check_out', today)
            .not('enriched_guest_name', 'is', null)
            .neq('enriched_guest_name', 'Not Available');

        if (!bookings?.length) {
            console.log('[MessageProcessor] No active bookings with guest names — run enrichment first');
            return stats;
        }

        console.log(`[MessageProcessor] ${bookings.length} active booking(s) with guest names`);

        // 4. Process each booking — conversation is always created regardless of
        //    whether relay messages exist yet. Messages are optional.
        for (const booking of bookings) {
            const guestName: string = booking.enriched_guest_name;
            stats.bookings_processed++;

            // Always ensure a conversation row exists for this booking.
            // findOrCreateConversation uses the UNIQUE(booking_id, channel) constraint
            // so repeated calls are idempotent.
            const { conversation, created: convCreated } = await this.findOrCreateConversation(
                supabase,
                booking,
                null // thread_id updated below once we find relay emails
            );

            if (!conversation) {
                console.error(`[MessageProcessor] Could not create conversation for booking ${booking.id}`);
                continue;
            }
            if (convCreated) {
                stats.conversations_created++;
                console.log(`[MessageProcessor] Created conversation for "${guestName}"`);
            }

            // Search gmail_messages for this guest's name in the subject.
            // The subject column is indexed; ilike is acceptable for small label sets.
            const { data: nameMatches } = await supabase
                .from('gmail_messages')
                .select('id, gmail_message_id, subject, snippet, thread_id, raw_metadata, created_at')
                .in('connection_id', connectionIds)
                .ilike('subject', `%${guestName}%`)
                .order('created_at', { ascending: true });

            // Classify to confirm relay messages (not confirmations or platform notices).
            let guestEmails = (nameMatches || []).filter((email: any) => {
                const result = classifyEmail(email.subject || '', email.snippet || '');
                return result.message_type === 'guest_message';
            });

            // Fallback: if no guest-name-in-subject emails found, search by check-in date.
            // Airbnb relay format when a guest replies to the reservation confirmation thread:
            //   "RE: Reservation for [property], Apr 21 – 23"  (no guest name in subject)
            if (!guestEmails.length) {
                const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const checkIn = new Date(booking.check_in);
                const checkInDateStr = `${MONTH_NAMES[checkIn.getUTCMonth()]} ${checkIn.getUTCDate()}`;

                const { data: dateMatches } = await supabase
                    .from('gmail_messages')
                    .select('id, gmail_message_id, subject, snippet, thread_id, raw_metadata, created_at')
                    .in('connection_id', connectionIds)
                    .ilike('subject', `%RE: Reservation for%${checkInDateStr}%`)
                    .order('created_at', { ascending: true });

                if (dateMatches?.length) {
                    const dateGuestEmails = dateMatches.filter((email: any) => {
                        const result = classifyEmail(email.subject || '', email.snippet || '');
                        return result.message_type === 'guest_message';
                    });
                    if (dateGuestEmails.length) {
                        console.log(`[MessageProcessor] "${guestName}" — ${dateGuestEmails.length} email(s) via date fallback ("${checkInDateStr}")`);
                        guestEmails = dateGuestEmails;
                    }
                }
            }

            if (!guestEmails.length) continue;

            console.log(`[MessageProcessor] "${guestName}" — ${guestEmails.length} relay email(s)`);

            // Track unread additions within this batch
            let unreadDelta = 0;
            let latestSentAt: string | null = null;
            const firstThreadId = guestEmails.find((e: any) => e.thread_id)?.thread_id ?? null;

            for (const email of guestEmails) {
                // Idempotency: skip if already in cohost_messages
                const { data: existing } = await supabase
                    .from('cohost_messages')
                    .select('id')
                    .eq('gmail_message_id', email.gmail_message_id)
                    .maybeSingle();

                if (existing) continue;

                // Extract the actual message text from the relay email HTML
                const raw = email.raw_metadata || {};
                const body = this.extractMessageBody(
                    raw.full_html || '',
                    raw.full_text || email.snippet || ''
                );

                if (!body.trim()) continue;

                const sentAt = email.created_at || new Date().toISOString();

                const { data: newMsg, error: msgErr } = await supabase
                    .from('cohost_messages')
                    .insert({
                        conversation_id: conversation.id,
                        direction: 'inbound',
                        body,
                        sent_at: sentAt,
                        sent_by_user_id: null,
                        gmail_message_id: email.gmail_message_id,
                        is_read: false,
                    })
                    .select('id')
                    .single();

                if (msgErr || !newMsg) {
                    console.error(`[MessageProcessor] Insert error:`, msgErr?.message);
                    continue;
                }

                stats.messages_created++;
                unreadDelta++;
                if (!latestSentAt || sentAt > latestSentAt) latestSentAt = sentAt;

                // Set message_type on the gmail_messages row while we're here
                await supabase
                    .from('gmail_messages')
                    .update({
                        processed_at: new Date().toISOString(),
                        message_type: 'guest_message',
                    })
                    .eq('gmail_message_id', email.gmail_message_id);
            }

            // Update conversation with thread_id and/or latest message info
            const convUpdate: any = {};
            if (unreadDelta > 0) convUpdate.unread_count = (conversation.unread_count || 0) + unreadDelta;
            if (latestSentAt) convUpdate.last_message_at = latestSentAt;
            if (firstThreadId && !conversation.gmail_thread_id) convUpdate.gmail_thread_id = firstThreadId;

            if (Object.keys(convUpdate).length > 0) {
                await supabase
                    .from('cohost_conversations')
                    .update(convUpdate)
                    .eq('id', conversation.id);
            }
        }

        console.log(`[MessageProcessor] Backfill complete:`, JSON.stringify(stats));
        return stats;
    }

    /**
     * Ongoing entry point — called per-connection by the enrichment cron
     * for new guest messages that arrive after the initial backfill.
     *
     * New emails have message_type already set by EmailProcessor, so this
     * remains email-first and processes only unprocessed guest_message rows.
     */
    static async processGuestMessages(
        connectionId: string,
        supabaseClient?: any,
        options?: { lookbackDays?: number; limit?: number; skipDraftGeneration?: boolean }
    ): Promise<MessageProcessorResult> {
        const supabase = supabaseClient || await createClient();

        console.log(`[MessageProcessor] ===== PROCESS GUEST MESSAGES =====`);
        console.log(`[MessageProcessor] Connection ID: ${connectionId}`);

        const stats: MessageProcessorResult = {
            processed: 0,
            conversations_created: 0,
            messages_created: 0,
            no_match: 0,
            errors: 0,
        };

        // Get workspace + linked properties
        const { data: conn } = await supabase
            .from('connections')
            .select('workspace_id')
            .eq('id', connectionId)
            .single();

        if (!conn?.workspace_id) {
            console.warn(`[MessageProcessor] Connection ${connectionId} has no workspace_id`);
            return stats;
        }

        const { data: connProps } = await supabase
            .from('connection_properties')
            .select('property_id')
            .eq('connection_id', connectionId);

        const propertyIds: string[] = connProps?.map((cp: any) => cp.property_id) || [];
        if (!propertyIds.length) {
            console.log(`[MessageProcessor] No linked properties for connection ${connectionId}`);
            return stats;
        }

        // Fetch unprocessed guest_message emails
        const batchLimit = options?.limit;
        let emailQuery = supabase
            .from('gmail_messages')
            .select('id, gmail_message_id, subject, snippet, thread_id, raw_metadata, created_at')
            .eq('connection_id', connectionId)
            .eq('message_type', 'guest_message')
            .is('processed_at', null)
            .order('created_at', { ascending: true });

        if (batchLimit) emailQuery = emailQuery.limit(batchLimit + 1);

        const { data: rawEmails, error: emailsError } = await emailQuery;
        if (emailsError) {
            console.error(`[MessageProcessor] Error fetching guest messages:`, emailsError);
            return stats;
        }

        const hasMore = batchLimit ? (rawEmails?.length ?? 0) > batchLimit : false;
        const emails = hasMore ? rawEmails!.slice(0, batchLimit) : (rawEmails ?? []);

        if (!emails.length) {
            console.log(`[MessageProcessor] No unprocessed guest messages for connection ${connectionId}`);
            return stats;
        }

        stats.has_more = hasMore;
        console.log(`[MessageProcessor] ${emails.length} unprocessed guest message(s)${hasMore ? ' (more remain)' : ''}`);

        // Candidate bookings
        const lookbackDays = options?.lookbackDays ?? 30;
        const pastWindow = new Date();
        pastWindow.setDate(pastWindow.getDate() - lookbackDays);

        const { data: bookings } = await supabase
            .from('bookings')
            .select('id, property_id, workspace_id, enriched_guest_name, guest_name, check_in, check_out, status, source')
            .in('property_id', propertyIds)
            .eq('is_active', true)
            .neq('status', 'cancelled')
            .gte('check_out', pastWindow.toISOString());

        const candidateBookings = bookings || [];

        for (const email of emails) {
            try {
                stats.processed++;

                const guestName = this.extractGuestNameFromSubject(email.subject || '');
                const raw = email.raw_metadata || {};
                const body = this.extractMessageBody(
                    raw.full_html || '',
                    raw.full_text || email.snippet || ''
                );

                if (!body.trim()) {
                    await this.markProcessed(supabase, email.gmail_message_id);
                    continue;
                }

                let matchingBooking = guestName
                    ? this.matchBookingByGuestName(guestName, candidateBookings)
                    : null;

                // Fallback: date-based matching for Airbnb relay reply threads where
                // the guest name is not in the subject.
                // Subject format: "RE: Reservation for [property], Apr 21 – 23"
                if (!matchingBooking) {
                    const checkInDate = this.extractCheckInDateFromRelaySubject(email.subject || '');
                    if (checkInDate) {
                        const dateMatches = candidateBookings.filter((b: any) =>
                            b.check_in?.startsWith(checkInDate)
                        );
                        if (dateMatches.length === 1) {
                            matchingBooking = dateMatches[0];
                            console.log(`[MessageProcessor] Date-matched relay email to booking ${matchingBooking.id} (check-in ${checkInDate})`);
                        }
                    }
                }

                if (!matchingBooking) {
                    console.log(`[MessageProcessor] No booking match for: "${email.subject}"`);
                    stats.no_match++;
                    await this.markProcessed(supabase, email.gmail_message_id);
                    continue;
                }

                const { conversation, created: convCreated } = await this.findOrCreateConversation(
                    supabase,
                    matchingBooking,
                    email.thread_id
                );

                if (!conversation) { stats.errors++; continue; }
                if (convCreated) stats.conversations_created++;

                const { data: existingMsg } = await supabase
                    .from('cohost_messages')
                    .select('id')
                    .eq('gmail_message_id', email.gmail_message_id)
                    .maybeSingle();

                if (existingMsg) {
                    await this.markProcessed(supabase, email.gmail_message_id);
                    continue;
                }

                const sentAt = email.created_at || new Date().toISOString();
                const { data: newMsg, error: msgError } = await supabase
                    .from('cohost_messages')
                    .insert({
                        conversation_id: conversation.id,
                        direction: 'inbound',
                        body,
                        sent_at: sentAt,
                        sent_by_user_id: null,
                        gmail_message_id: email.gmail_message_id,
                        is_read: false,
                    })
                    .select('id')
                    .single();

                if (msgError || !newMsg) {
                    console.error(`[MessageProcessor] Error inserting message:`, msgError);
                    stats.errors++;
                    continue;
                }

                stats.messages_created++;

                const convUpdate: any = {
                    last_message_at: sentAt,
                    unread_count: (conversation.unread_count || 0) + 1,
                };
                if (email.thread_id && !conversation.gmail_thread_id) {
                    convUpdate.gmail_thread_id = email.thread_id;
                }
                await supabase.from('cohost_conversations').update(convUpdate).eq('id', conversation.id);

                await this.markProcessed(supabase, email.gmail_message_id);
                console.log(`[MessageProcessor] ✅ Message stored for "${guestName}"`);

                // AI draft — skipped during backfill; only for live cron
                if (process.env.OPENAI_API_KEY && !options?.skipDraftGeneration) {
                    try {
                        await DraftGeneratorService.generateForMessage(conversation.id, newMsg.id, supabase);
                    } catch (draftErr: any) {
                        console.warn(`[MessageProcessor] Draft generation error (non-fatal): ${draftErr.message}`);
                    }
                }

            } catch (err: any) {
                console.error(`[MessageProcessor] Error on ${email.gmail_message_id}:`, err.message);
                stats.errors++;
            }
        }

        console.log(`[MessageProcessor] Complete:`, JSON.stringify(stats));
        return stats;
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Extract the check-in date from Airbnb relay reply-thread subjects.
     * These arrive as: "RE: Reservation for [property], Apr 21 – 23"
     * (thin spaces \u2009 and en-dash may surround the date range)
     * Returns ISO date string "YYYY-MM-DD" or null if pattern not found.
     */
    static extractCheckInDateFromRelaySubject(subject: string): string | null {
        if (!subject) return null;
        // Strip bidi/invisible characters and thin spaces
        const clean = subject.replace(/[\u200e\u200f\u202a-\u202e\u2060-\u206f\u2009]/g, ' ').trim();
        // Match ", Apr 21 –" or ", Apr 21 -" (date followed by range dash)
        const match = clean.match(/,\s*([A-Za-z]{3})\s+(\d{1,2})\s*[–\-]/);
        if (!match) return null;
        const MONTHS: Record<string, string> = {
            Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
            Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
        };
        const month = MONTHS[match[1]];
        if (!month) return null;
        const day = match[2].padStart(2, '0');
        const year = new Date().getFullYear();
        return `${year}-${month}-${day}`;
    }

    static extractGuestNameFromSubject(subject: string): string | null {
        if (!subject) return null;
        const clean = subject.replace(/[\u200e\u200f\u202a-\u202e\u2060-\u206f]/g, '').trim();

        const sentYou = clean.match(/^(.+?)\s+sent you a message/i);
        if (sentYou) return sentYou[1].trim();

        const msgFrom = clean.match(/^Message from\s+(.+?)(?:\s*[-–]|$)/i);
        if (msgFrom) return msgFrom[1].trim();

        const reArrival = clean.match(/Re:.*?(?:confirmed|from)\s*[-:]\s*(.+?)\s+arrives/i);
        if (reArrival) return reArrival[1].trim();

        return null;
    }

    static extractMessageBody(html: string, fallbackText: string): string {
        if (!html) return fallbackText.trim();

        let text = html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<\/tr>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        const cutPatterns = [
            /^Reply to this email.*/im,
            /^To respond to .*/im,
            /^You can also respond.*/im,
            /^Airbnb, Inc\..*/im,
            /^888 Brannan St.*/im,
            /^This email was sent.*/im,
            /^Unsubscribe.*/im,
            /^© \d{4} Airbnb.*/im,
            /^View in browser.*/im,
            /^Privacy Policy.*/im,
            /^VRBO\.com.*/im,
            /^HomeAway\.com.*/im,
        ];

        for (const pattern of cutPatterns) {
            const match = text.match(pattern);
            if (match && typeof match.index === 'number') {
                text = text.substring(0, match.index).trim();
            }
        }

        // Airbnb relay structure:
        //   "[GuestFirstName]\n[Booker|Guest]\n\n[ACTUAL MESSAGE]\n\nReply"
        // Extract only the message content between "Booker/Guest" and "Reply".
        const airbnbRelayMatch = text.match(/\n\s*(?:Booker|Guest)\s*\n+\s*\n([\s\S]+?)\n+\s*Reply\s*(?:\n|$)/);
        if (airbnbRelayMatch) {
            const extracted = airbnbRelayMatch[1].trim();
            if (extracted.length >= 10) return extracted;
        }

        return text.length >= 10 ? text : fallbackText.trim();
    }

    static matchBookingByGuestName(guestName: string, bookings: any[]): any | null {
        if (!guestName || !bookings.length) return null;

        const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
        const query = normalize(guestName);
        const queryFirst = query.split(' ')[0];
        const now = new Date();

        const scored = bookings
            .map(b => {
                const enriched = b.enriched_guest_name ? normalize(b.enriched_guest_name) : null;
                const raw = b.guest_name ? normalize(b.guest_name) : null;

                let score = 0;
                if (enriched === query)                          score = 100;
                else if (raw === query)                          score = 90;
                else if (enriched?.split(' ')[0] === queryFirst) score = 60;
                else if (raw?.split(' ')[0] === queryFirst)      score = 50;
                else if (enriched?.includes(queryFirst))         score = 30;
                else if (raw?.includes(queryFirst))              score = 25;

                if (score === 0) return null;

                const checkIn  = new Date(b.check_in);
                const checkOut = new Date(b.check_out);
                if (checkIn > now)   score += 20;
                else if (checkOut > now) score += 15;

                return { booking: b, score };
            })
            .filter(Boolean) as { booking: any; score: number }[];

        if (!scored.length) return null;
        scored.sort((a, b) => b.score - a.score);
        if (scored[0].score < 50) return null;

        return scored[0].booking;
    }

    private static async findOrCreateConversation(
        supabase: any,
        booking: any,
        threadId: string | null
    ): Promise<{ conversation: any | null; created: boolean }> {

        if (threadId) {
            const { data: byThread } = await supabase
                .from('cohost_conversations')
                .select('*')
                .eq('gmail_thread_id', threadId)
                .maybeSingle();
            if (byThread) return { conversation: byThread, created: false };
        }

        const { data: byBooking } = await supabase
            .from('cohost_conversations')
            .select('*')
            .eq('booking_id', booking.id)
            .eq('channel', 'gmail_relay')
            .maybeSingle();
        if (byBooking) return { conversation: byBooking, created: false };

        const { data: newConv, error } = await supabase
            .from('cohost_conversations')
            .insert({
                booking_id:      booking.id,
                workspace_id:    booking.workspace_id,
                property_id:     booking.property_id,
                channel:         'gmail_relay',
                gmail_thread_id: threadId || null,
                last_message_at: new Date().toISOString(),
                unread_count:    0,
            })
            .select()
            .single();

        if (error) {
            console.error(`[MessageProcessor] Error creating conversation:`, error);
            return { conversation: null, created: false };
        }

        return { conversation: newConv, created: true };
    }

    private static async markProcessed(supabase: any, gmailMessageId: string) {
        await supabase
            .from('gmail_messages')
            .update({ processed_at: new Date().toISOString() })
            .eq('gmail_message_id', gmailMessageId);
    }
}
