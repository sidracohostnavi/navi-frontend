import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';

// --- Types ---
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
     * Syncs a single iCal feed: fetches, parses, and upserts bookings.
     * 
     * CRITICAL RULE (Law 15 - Structural Enforcement):
     * This function ONLY writes iCal data. It NEVER reads or writes enrichment columns:
     *   - enriched_guest_name
     *   - enriched_guest_count
     *   - enriched_connection_id
     *   - enriched_at
     * 
     * Enrichment is handled exclusively by EmailProcessor.enrichBookings()
     */
    static async syncFeed(feed: ICalFeed, workspaceId: string, supabaseClient?: SupabaseClient): Promise<SyncResult> {
        const supabase = supabaseClient || await createClient();
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
            // 1. Fetch iCal Feed with 10s Timeout
            const ical = require('node-ical');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

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

            // 2. Parse ICS
            events = await ical.async.parseICS(textBody);

            let veventCount = 0;
            for (const k in events) {
                if (events[k].type === 'VEVENT') veventCount++;
            }
            if (!snippet.includes('BEGIN:VCALENDAR') && veventCount === 0) {
                throw new Error(`Invalid iCal response. Content-Type: ${contentType}. No VEVENT found.`);
            }
            eventCount = veventCount;

            // 3. Process Events
            for (const [uid, event] of Object.entries(events) as [string, any][]) {
                if (event.type !== 'VEVENT') continue;
                feedEventsFound++;

                // Canonicalize UID (strip Lodgify prefix if present)
                let canonicalUid = uid;
                const lodgifyPattern = /^B\d+_(.+)$/;
                const match = uid.match(lodgifyPattern);
                if (match && match[1]) {
                    canonicalUid = match[1];
                }

                // Date Parsing — normalize to noon UTC
                const toNoonUTC = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));

                let start: Date | null = null;
                let end: Date | null = null;

                if (event.start) {
                    const d = new Date(event.start);
                    start = (event.start.dateOnly || event.datetype === 'date') ? toNoonUTC(d) : d;
                }
                if (event.end) {
                    const d = new Date(event.end);
                    end = (event.end.dateOnly || event.datetype === 'date') ? toNoonUTC(d) : d;
                }

                if (!start || !end) continue;

                // Extract raw iCal data
                const summary = event.summary || 'Blocked';
                const platform = feed.source_name || feed.name || 'External';
                const sanitizedRawData = sanitizeForJson(event);

                // 4. Look up existing booking (Law 16: external_uid + property_id first)
                let targetBooking: any = null;

                try {
                    // Primary lookup: external_uid + property_id
                    const { data: uidMatch } = await supabase
                        .from('bookings')
                        .select('id')
                        .eq('workspace_id', workspaceId)
                        .eq('property_id', feed.property_id)
                        .eq('external_uid', canonicalUid)
                        .limit(1)
                        .maybeSingle();

                    if (uidMatch) {
                        targetBooking = uidMatch;
                    }

                    // Fallback: exact date match (no window — Law 16)
                    if (!targetBooking) {
                        const inDateStr = start.toISOString().split('T')[0];
                        const outDateStr = end.toISOString().split('T')[0];

                        const { data: dateMatch } = await supabase
                            .from('bookings')
                            .select('id')
                            .eq('workspace_id', workspaceId)
                            .eq('property_id', feed.property_id)
                            .eq('is_active', true)
                            .eq('check_in', `${inDateStr}T12:00:00.000Z`)
                            .eq('check_out', `${outDateStr}T12:00:00.000Z`)
                            .limit(1)
                            .maybeSingle();

                        if (dateMatch) {
                            targetBooking = dateMatch;
                        }
                    }
                } catch (e) {
                    console.error('[ICalProcessor] Failed to query existing booking:', e);
                }

                // 5. Build payload — ONLY iCal fields
                const icalPayload: any = {
                    workspace_id: workspaceId,
                    property_id: feed.property_id,
                    source_type: feed.source_type,
                    external_uid: canonicalUid,
                    check_in: start.toISOString(),
                    check_out: end.toISOString(),
                    guest_name: summary,
                    guest_count: 1,
                    status: 'confirmed',
                    platform: platform,
                    raw_data: sanitizedRawData,
                    last_synced_at: new Date().toISOString(),
                    source_feed_id: feed.id,
                    is_active: true
                };

                let bookingError;
                let isChange = false;

                if (targetBooking) {
                    // UPDATE existing booking — never touch enrichment columns
                    const { error } = await supabase
                        .from('bookings')
                        .update({
                            check_in: icalPayload.check_in,
                            check_out: icalPayload.check_out,
                            guest_name: icalPayload.guest_name,
                            guest_count: icalPayload.guest_count,
                            status: icalPayload.status,
                            platform: icalPayload.platform,
                            raw_data: icalPayload.raw_data,
                            last_synced_at: icalPayload.last_synced_at,
                            source_feed_id: icalPayload.source_feed_id,
                            is_active: icalPayload.is_active
                        })
                        .eq('id', targetBooking.id);
                    bookingError = error;
                    isChange = !error;
                } else {
                    // INSERT new booking
                    const { error } = await supabase
                        .from('bookings')
                        .insert([icalPayload]);
                    bookingError = error;
                    isChange = !error;
                }

                if (bookingError) {
                    // Log but don't fail the whole sync
                    console.error(`[ICalProcessor] DB Error | Feed: ${feed.id} | UID: ${canonicalUid} | Err:`, bookingError.message);
                } else if (isChange) {
                    totalUpdated++;
                }
            }

            // 6. Update Feed Status (Success)
            const { count: activeBookingCount } = await supabase
                .from('bookings')
                .select('*', { count: 'exact', head: true })
                .eq('source_feed_id', feed.id)
                .eq('is_active', true);

            await supabase.from('ical_feeds').update({
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

            console.log(`[ICalProcessor] Feed ${feed.id} complete: ${feedEventsFound} events, ${totalUpdated} changes`);

            return {
                feed_id: feed.id,
                success: true,
                events_found: feedEventsFound,
                processed_count: totalUpdated
            };

        } catch (err: any) {
            console.error(`[ICalProcessor] Error syncing feed ${feed.id}:`, err);
            syncError = err.message || 'Unknown error';

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
                error: syncError
            };
        }
    }
}
