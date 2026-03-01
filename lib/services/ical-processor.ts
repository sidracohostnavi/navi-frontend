import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';

// --- Types ---
interface ReservationFact {
    confirmation_code?: string;
    check_in?: string;
    check_out?: string;
    guest_name: string;
    guest_count?: number;
}

interface ICalFeed {
    id: string;
    property_id: string;
    source_name: string;
    source_type: string;
    ical_url: string;
    name?: string;
}

interface SyncResult {
    feed_id: string;
    success: boolean;
    events_found: number;
    processed_count: number;
    error?: string;
}

// --- Helper: Sanitize ---
function sanitizeForJson(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return obj.toString();
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeForJson);
    if (obj instanceof Date) return obj.toISOString();
    const newObj: any = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            newObj[key] = sanitizeForJson(obj[key]);
        }
    }
    return newObj;
}

// --- Service ---
export class ICalProcessor {
    /**
     * Syncs a single iCal feed: fetches, parses, matches facts, and upserts bookings.
     */
    static async syncFeed(feed: ICalFeed, workspaceId: string, supabaseClient?: SupabaseClient): Promise<SyncResult> {
        const supabase = supabaseClient || await createClient(); // Use provided client or fallback to server client
        console.log(`[ICalProcessor] Processing feed ${feed.id} for property ${feed.property_id}`);

        let httpStatus = 0;
        let contentType = '';
        let finalUrl = feed.ical_url;
        let snippet = '';
        let eventCount = 0;
        let feedEventsFound = 0;
        let totalUpdated = 0;
        let syncError: string | null = null;
        let events: any = {};

        try {
            // 1. Load Reservation Facts for Enrichment (Workspace-scoped, including archived connections)
            // Two-step query: get ALL connection IDs from workspace, then load facts
            let facts: ReservationFact[] = [];
            try {
                const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

                // Step 1: Get ALL connection IDs linked strictly to THIS property
                const { data: linkedConnections } = await supabase
                    .from('connection_properties')
                    .select('connection_id')
                    .eq('property_id', feed.property_id);

                if (linkedConnections && linkedConnections.length > 0) {
                    const connectionIds = linkedConnections.map(c => c.connection_id);

                    // Step 2: Load facts from any of these connections
                    const { data: rawFacts } = await supabase
                        .from('reservation_facts')
                        .select('*')
                        .in('connection_id', connectionIds)
                        .gt('check_out', windowStart);

                    if (rawFacts) facts = rawFacts as any[];
                }
                console.log(`[ICalProcessor] Loaded ${facts.length} reservation facts for property ${feed.property_id}`);
            } catch (e) {
                console.warn('[ICalProcessor] Failed to load reservation facts:', e);
            }

            // 2. Fetch iCal Feed with 10s Timeout
            const ical = require('node-ical');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s hard limit

            let response;
            try {
                response = await fetch(feed.ical_url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/calendar, text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8'
                    },
                    redirect: 'follow',
                    signal: controller.signal
                });
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    throw new Error(`fetch timeout: feed url exceeded 10s limit`);
                }
                throw err;
            } finally {
                clearTimeout(timeoutId);
            }

            httpStatus = response.status;
            contentType = response.headers.get('content-type') || '';
            finalUrl = response.url;
            const textBody = await response.text();
            snippet = textBody.substring(0, 500);

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            // 3. Parse ICS
            events = await ical.async.parseICS(textBody);

            // Validate
            let veventCount = 0;
            for (const k in events) {
                if (events[k].type === 'VEVENT') veventCount++;
            }
            if (!snippet.includes('BEGIN:VCALENDAR') && veventCount === 0) {
                throw new Error(`Invalid iCal response. Content-Type: ${contentType}. No VEVENT found.`);
            }
            eventCount = veventCount;

            // 4. Process Events
            for (const [uid, event] of Object.entries(events) as [string, any][]) {
                if (event.type !== 'VEVENT') continue;
                feedEventsFound++;

                let canonicalUid = uid;
                const lodgifyPattern = /^B\d+_(.+)$/;
                const match = uid.match(lodgifyPattern);
                if (match && match[1]) {
                    canonicalUid = match[1];
                }

                // Date Parsing
                const toNoonUTC = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));

                let start: Date | null = null;
                let end: Date | null = null;

                if (event.start) {
                    let d = new Date(event.start);
                    start = (event.start.dateOnly || event.datetype === 'date') ? toNoonUTC(d) : d;
                }
                if (event.end) {
                    let d = new Date(event.end);
                    end = (event.end.dateOnly || event.datetype === 'date') ? toNoonUTC(d) : d;
                }

                if (!start || !end) continue;

                // 5. Enrichment Logic
                const summary = event.summary || 'Blocked';
                let guestName = summary;
                let guestCount = 1;
                let guestFirst = null;
                let guestLastInitial = null;
                // Prefer user-defined name, fallback to source type
                let platform = feed.source_name || feed.name || 'External';
                let enriched = false;

                const startStr = start.toISOString().split('T')[0];
                const endStr = end.toISOString().split('T')[0];

                const factMatches = facts.filter(f => {
                    // Code Match
                    if (f.confirmation_code && f.confirmation_code.length >= 6) {
                        if (summary.includes(f.confirmation_code) || event.description?.includes(f.confirmation_code)) {
                            return true;
                        }
                    }
                    // Strict Date Match
                    if (f.check_in === startStr && f.check_out === endStr) return true;
                    return false;
                });

                if (factMatches.length === 1) {
                    const matchedFact = factMatches[0];
                    enriched = true;
                    // Only override if the fact actually has a non-empty guest_name
                    if (matchedFact.guest_name && matchedFact.guest_name.trim() !== '') {
                        guestName = matchedFact.guest_name;
                    }
                    guestCount = matchedFact.guest_count || 1;
                    // If enriched via email parser, we usually know it's Airbnb from the parser logic,
                    // but we should technically trust the FEED SOURCE NAME if the user set it (e.g. "My Airbnb").
                    // So we stick to `feed.source_name` unless undefined.

                    if (guestName) {
                        const parts = guestName.split(' ');
                        if (parts.length > 0) guestFirst = parts[0];
                        if (parts.length > 1) guestLastInitial = parts[1].replace('.', '');
                    }
                } else {
                    if (summary && (summary.includes('Reserved') || summary.toLowerCase().includes('blocking'))) {
                        guestName = 'Reserved';
                    }
                }

                // 6. Preserve existing real guest names (don't overwrite with masked names)
                const isMaskedName = (n: string | null | undefined) => {
                    if (!n) return false;
                    return ['Reserved', 'Blocked', 'Not available', 'Unknown', 'Private'].some(m =>
                        n.toLowerCase() === m.toLowerCase() || n.toLowerCase().startsWith(m.toLowerCase())
                    );
                };

                // Check if booking already exists with a real (non-masked) guest name
                if (isMaskedName(guestName)) {
                    try {
                        const { data: existing } = await supabase
                            .from('bookings')
                            .select('guest_name, guest_first_name, guest_last_initial')
                            .eq('property_id', feed.property_id)
                            .eq('source_type', feed.source_type)
                            .eq('external_uid', canonicalUid)
                            .single();

                        if (existing?.guest_name && !isMaskedName(existing.guest_name)) {
                            // Preserve the existing real name
                            guestName = existing.guest_name;
                            guestFirst = existing.guest_first_name;
                            guestLastInitial = existing.guest_last_initial;
                            console.log(`[ICalProcessor] Preserved existing guest name "${guestName}" for ${uid}`);
                        }
                    } catch (e) {
                        // No existing booking, that's fine
                    }
                }

                // 7. Safe Lookup & Write Booking
                let targetBooking: any = undefined;

                try {
                    const inDateStr = start.toISOString().split('T')[0];
                    const outDateStr = end.toISOString().split('T')[0];

                    const nextIn = new Date(start);
                    nextIn.setUTCDate(nextIn.getUTCDate() + 1);
                    const nextInStr = nextIn.toISOString().split('T')[0];

                    const nextOut = new Date(end);
                    nextOut.setUTCDate(nextOut.getUTCDate() + 1);
                    const nextOutStr = nextOut.toISOString().split('T')[0];

                    const { data: existing, error: searchError } = await supabase
                        .from('bookings')
                        .select('id, check_in, check_out, guest_name, guest_count, status, is_active, platform, external_uid')
                        .eq('workspace_id', workspaceId)
                        .eq('property_id', feed.property_id)
                        .eq('is_active', true)
                        .gte('check_in', `${inDateStr}T00:00:00.000Z`)
                        .lt('check_in', `${nextInStr}T00:00:00.000Z`)
                        .gte('check_out', `${outDateStr}T00:00:00.000Z`)
                        .lt('check_out', `${nextOutStr}T00:00:00.000Z`)
                        .order('last_synced_at', { ascending: false, nullsFirst: false })
                        .limit(2);

                    if (!searchError && existing && existing.length > 0) {
                        targetBooking = existing[0];
                        if (existing.length > 1) {
                            console.warn(`[ICalProcessor] Multiple booking matches for date window ${inDateStr} to ${outDateStr}... choosing most recent`);
                        }
                    }
                } catch (e) {
                    console.error('[ICalProcessor] Failed to query existing booking:', e);
                }

                const sanitizedRawData = sanitizeForJson(event);
                const payload = {
                    workspace_id: workspaceId,
                    property_id: feed.property_id,
                    source_type: feed.source_type,
                    external_uid: canonicalUid,
                    check_in: start.toISOString(),
                    check_out: end.toISOString(),
                    guest_name: guestName,
                    guest_count: guestCount,
                    guest_first_name: guestFirst,
                    guest_last_initial: guestLastInitial,
                    status: 'confirmed',
                    platform: platform,
                    raw_data: { ...sanitizedRawData, enriched_from_fact: enriched },
                    last_synced_at: new Date().toISOString(),
                    source_feed_id: feed.id,
                    is_active: true
                };

                let bookingError;
                let isChange = false;

                if (targetBooking) {
                    const isIdentical =
                        new Date(targetBooking.check_in).getTime() === new Date(payload.check_in).getTime() &&
                        new Date(targetBooking.check_out).getTime() === new Date(payload.check_out).getTime() &&
                        targetBooking.guest_name === payload.guest_name &&
                        targetBooking.guest_count === payload.guest_count &&
                        targetBooking.status === payload.status &&
                        targetBooking.is_active === payload.is_active &&
                        targetBooking.platform === payload.platform &&
                        targetBooking.external_uid === payload.external_uid;

                    if (!isIdentical) {
                        const { error } = await supabase
                            .from('bookings')
                            .update(payload)
                            .eq('id', targetBooking.id);
                        bookingError = error;
                        isChange = true;
                    }
                } else {
                    const { error } = await supabase
                        .from('bookings')
                        .insert([payload]);
                    bookingError = error;
                    isChange = true;
                }

                if (bookingError) {
                    console.error(`[ICalProcessor] Sync DB Error | Feed: ${feed.id} | Prop: ${feed.property_id} | UID: ${canonicalUid} | Range: ${start.toISOString()} - ${end.toISOString()} | Err:`, bookingError.message || bookingError);
                } else if (isChange) {
                    totalUpdated++;
                }
            }

            // 7. Update Feed Status (Success)
            // Count active bookings for stat
            const { count: activeBookingCount } = await supabase
                .from('bookings')
                .select('*', { count: 'exact', head: true })
                .eq('source_feed_id', feed.id)
                .eq('is_active', true);

            const { error: updateError } = await supabase.from('ical_feeds').update({
                last_synced_at: new Date().toISOString(),
                last_sync_status: 'success',
                last_error: null,
                last_http_status: httpStatus,
                last_content_type: contentType,
                last_final_url: finalUrl,
                last_response_snippet: snippet,
                last_event_count: eventCount,
                last_booking_count: activeBookingCount ?? 0
            }).eq('id', feed.id);

            if (updateError) {
                console.error(`[ICalProcessor] Failed to update feed status for ${feed.id}:`, updateError);
            } else {
                console.log(`[ICalProcessor] Successfully updated timestamp for feed ${feed.id}`);
            }

            // Log to ical_sync_log only when events were created/updated.
            // Silent no-op syncs (nothing changed) produce no log record.
            if (totalUpdated > 0) {
                const { error: logError } = await supabase.from('ical_sync_log').insert({
                    workspace_id: workspaceId,
                    property_id: feed.property_id,
                    channel: feed.source_type,
                    synced_at: new Date().toISOString(),
                    events_found: feedEventsFound,
                    events_created: totalUpdated, // Using processed_count as created (upserts)
                    events_updated: 0,
                    events_cancelled: 0,
                    success: true,
                    error_message: null
                });

                if (logError) {
                    console.error('[ICalProcessor] Failed to insert ical_sync_log:', logError);
                }
            }

            return {
                feed_id: feed.id,
                success: true,
                events_found: feedEventsFound,
                processed_count: totalUpdated
            };

        } catch (err: any) {
            console.error(`[ICalProcessor] Error syncing feed ${feed.id}:`, err);
            syncError = err.message || 'Unknown error';

            // Update Feed Status (Error)
            await supabase.from('ical_feeds').update({
                last_synced_at: new Date().toISOString(),
                last_sync_status: 'error',
                last_error: syncError,
                last_http_status: httpStatus,
                last_content_type: contentType,
                last_final_url: finalUrl,
                last_response_snippet: snippet,
                last_event_count: eventCount,
                last_booking_count: 0
            }).eq('id', feed.id);

            // Log to ical_sync_log (failure)
            const { error: logError } = await supabase.from('ical_sync_log').insert({
                workspace_id: workspaceId,
                property_id: feed.property_id,
                channel: feed.source_type,
                synced_at: new Date().toISOString(),
                events_found: feedEventsFound,
                events_created: 0,
                events_updated: 0,
                events_cancelled: 0,
                success: false,
                error_message: syncError
            });

            if (logError) {
                console.error('[ICalProcessor] Failed to insert ical_sync_log:', logError);
            }

            return {
                feed_id: feed.id,
                success: false,
                events_found: feedEventsFound,
                processed_count: totalUpdated,
                error: syncError || undefined
            };
        }
    }
}
