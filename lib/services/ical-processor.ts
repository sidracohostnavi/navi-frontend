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
    static async syncFeed(feed: ICalFeed, workspaceId: string): Promise<SyncResult> {
        const supabase = await createClient(); // Use server client
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
            // 1. Load Reservation Facts for Enrichment (Scoped to this property's connections)
            let facts: ReservationFact[] = [];
            try {
                const { data: connProps } = await supabase
                    .from('connection_properties')
                    .select('connection_id')
                    .eq('property_id', feed.property_id);

                if (connProps && connProps.length > 0) {
                    const connectionIds = connProps.map(cp => cp.connection_id);
                    const { data: rawFacts } = await supabase
                        .from('reservation_facts')
                        .select('*')
                        .in('connection_id', connectionIds)
                        .gt('check_out', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days + future

                    if (rawFacts) facts = rawFacts as any[];
                }
            } catch (e) {
                console.warn('[ICalProcessor] Failed to load reservation facts:', e);
            }

            // 2. Fetch iCal Feed
            const ical = require('node-ical');
            const response = await fetch(feed.ical_url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/calendar, text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8'
                },
                redirect: 'follow'
            });

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

                const matchedFact = facts.find(f => {
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

                if (matchedFact) {
                    enriched = true;
                    guestName = matchedFact.guest_name;
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
                    if (summary.includes('Reserved') || summary.toLowerCase().includes('blocking')) {
                        guestName = 'Reserved';
                    }
                }

                // 6. Upsert Booking
                const sanitizedRawData = sanitizeForJson(event);
                const { error: bookingError } = await supabase
                    .from('bookings')
                    .upsert({
                        workspace_id: workspaceId,
                        property_id: feed.property_id,
                        source_type: feed.source_type,
                        external_uid: uid,
                        check_in: start.toISOString(),
                        check_out: end.toISOString(),
                        guest_name: guestName,
                        guest_count: guestCount,
                        guest_first_name: guestFirst,
                        guest_last_initial: guestLastInitial,
                        status: 'confirmed',
                        platform: platform, // This stores the Human Readable Source Name
                        raw_data: { ...sanitizedRawData, enriched_from_fact: enriched },
                        last_synced_at: new Date().toISOString(),
                        source_feed_id: feed.id,
                        is_active: true
                    }, {
                        onConflict: 'property_id, source_type, external_uid'
                    });

                if (bookingError) console.error(`[ICalProcessor] Failed to upsert ${uid}:`, bookingError);
                else totalUpdated++;
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
