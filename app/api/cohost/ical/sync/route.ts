import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Helper to safely serialize objects containing BigInts
function sanitizeForJson(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return obj.toString();
    if (typeof obj !== 'object') return obj;

    // Handle Arrays
    if (Array.isArray(obj)) {
        return obj.map(sanitizeForJson);
    }

    // Handle Dates (ensure they remain strings/dates for JSON)
    if (obj instanceof Date) return obj.toISOString();

    // Handle Objects
    const newObj: any = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            newObj[key] = sanitizeForJson(obj[key]);
        }
    }
    return newObj;
}

// ... (imports remain)

export async function POST(request: Request) {
    try {
        console.log('API: Sync request started');
        const ical = require('node-ical');
        console.log('API: node-ical loaded');
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Parse request body
        const { property_id, feed_id } = await request.json();
        if (!property_id) {
            return NextResponse.json({ error: 'Missing property_id' }, { status: 400 });
        }

        // 3. Verify access to property
        const { data: property, error: propError } = await supabase
            .from('cohost_properties')
            .select('id, workspace_id')
            .eq('id', property_id)
            .single();

        if (propError || !property) {
            return NextResponse.json({ error: 'Property not found or access denied', details: propError }, { status: 404 });
        }

        // 3.5 Fetch relevant Reservation Facts for Enrichment
        let facts: any[] = [];
        try {
            // Find connections linked to this property
            const { data: connProps } = await supabase
                .from('connection_properties')
                .select('connection_id')
                .eq('property_id', property_id);

            if (connProps && connProps.length > 0) {
                const connectionIds = connProps.map(cp => cp.connection_id);
                // Fetch valid future/recent facts
                const { data: rawFacts } = await supabase
                    .from('reservation_facts')
                    .select('*')
                    .in('connection_id', connectionIds)
                    .gt('check_out', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days + future

                if (rawFacts) facts = rawFacts;
            }
            console.log(`API: Loaded ${facts.length} reservation facts for enrichment`);
        } catch (e) {
            console.warn('API: Failed to load reservation facts:', e);
            // Continue without enrichment
        }

        try {
            // 4. Fetch Active Feeds
            let query = supabase
                .from('ical_feeds')
                .select('*')
                .eq('property_id', property_id)
                .eq('is_active', true);

            if (feed_id) {
                query = query.eq('id', feed_id);
            }

            const { data: feeds } = await query;

            if (!feeds || feeds.length === 0) {
                return NextResponse.json({
                    success: true,
                    message: 'No active feeds found',
                    feeds_synced: 0
                });
            }

            let totalEventsFound = 0;
            let totalUpdated = 0;

            // 5. Process each feed
            for (const feed of feeds) {
                console.log(`API: Processing feed ${feed.id} from URL: ${feed.ical_url}`);
                let httpStatus = 0;
                let contentType = '';
                let finalUrl = feed.ical_url;
                let snippet = '';
                let eventCount = 0;
                let syncError: string | null = null;
                let events: any = {};

                try {
                    // Manual Fetch to control Headers and Debugging
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
                    snippet = textBody.substring(0, 500); // Save first 500 chars

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    // Parse ICS
                    events = await ical.async.parseICS(textBody);
                    eventCount = Object.keys(events || {}).length;
                    console.log(`API: Events fetched for ${feed.id}. Key count: ${eventCount}`);

                    // Strict Validation
                    const hasVCalendar = snippet.includes('BEGIN:VCALENDAR');
                    const hasEvents = eventCount > 0;

                    let veventCount = 0;
                    for (const k in events) {
                        if (events[k].type === 'VEVENT') veventCount++;
                    }

                    if (!hasVCalendar && veventCount === 0) {
                        throw new Error(`Invalid iCal response. Content-Type: ${contentType}. No VCALENDAR or VEVENT found.`);
                    }

                    eventCount = veventCount;


                    // Process Events
                    let feedEventsFound = 0;

                    for (const [uid, event] of Object.entries(events) as [string, any][]) {
                        if (event.type === 'VEVENT') {
                            feedEventsFound++;

                            // Extract data
                            let start: Date | null = null;
                            let end: Date | null = null;

                            // Helper to convert date-only to Noon UTC
                            const toNoonUTC = (d: Date) => {
                                return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));
                            };

                            if (event.start) {
                                let d = new Date(event.start);
                                if (event.start.dateOnly || event.datetype === 'date') {
                                    start = toNoonUTC(d);
                                } else {
                                    start = d;
                                }
                            }

                            if (event.end) {
                                let d = new Date(event.end);
                                if (event.end.dateOnly || event.datetype === 'date') {
                                    end = toNoonUTC(d);
                                } else {
                                    end = d;
                                }
                            }

                            const summary = event.summary || 'Blocked';
                            let guestName = summary;
                            // Default to summary, but we will try to enrich
                            let guestCount = 1;
                            let guestFirst = null;
                            let guestLastInitial = null;
                            let platform = feed.name || feed.source_name;
                            let enriched = false;

                            // 5.5 MATCHING LOGIC
                            // Try to match with reservation_facts
                            if (start && end) {
                                const startStr = start.toISOString().split('T')[0];
                                const endStr = end.toISOString().split('T')[0];

                                // Look for match
                                const matchedFact = facts.find(f => {
                                    // 1. Confirmation Code Match (Strongest)
                                    // Check if summary/description contains code
                                    if (f.confirmation_code && f.confirmation_code.length >= 6) {
                                        if (summary.includes(f.confirmation_code) || event.description?.includes(f.confirmation_code)) {
                                            return true;
                                        }
                                    }

                                    // 2. Exact Date Match (Strict)
                                    // MUST match both start (check_in) and end (check_out)
                                    if (f.check_in === startStr && f.check_out === endStr) {
                                        // If fact has a code, but it wasn't found in summary, we still accept Strict Date match
                                        // BUT we might want to be careful if multiple properties share dates.
                                        // For iCal sync, we are inside a specific property feed.
                                        // If another property has same dates, it would match there too.
                                        // Limitation: We can't easily cross-check other properties here efficiently.
                                        // Relaxed Rule: Exact Date match is acceptable if Code match didn't fire (and code might be missing in iCal body).
                                        return true;
                                    }

                                    // 3. Removed Weak Overlap/Check-in-only match
                                    // "If f.check_in === startStr" -> REMOVED per user "Property Resolution Safety" rule.

                                    return false;
                                });

                                if (matchedFact) {
                                    enriched = true;
                                    guestName = matchedFact.guest_name;
                                    guestCount = matchedFact.guest_count || 1;
                                    platform = 'Airbnb'; // Assume Airbnb if matched via email parser (since we only parse Airbnb now)

                                    // Parse First/Last Initial
                                    if (guestName) {
                                        // "Sidra C." or "Sidra"
                                        const parts = guestName.split(' ');
                                        if (parts.length > 0) guestFirst = parts[0];
                                        if (parts.length > 1) guestLastInitial = parts[1].replace('.', '');
                                    }

                                    console.log(`API: Enriched event ${uid} -> ${guestName} (${guestCount})`);
                                }
                            }

                            // If not enriched, clean up default summary if it's generic
                            if (!enriched) {
                                if (summary.includes('Reserved') || summary.toLowerCase().includes('blocking')) {
                                    guestName = 'Reserved';
                                }
                            }

                            if (start && end) {
                                const sanitizedRawData = sanitizeForJson(event);

                                // CANONICAL SOURCE: iCal feed determines property_id
                                // Email matching (lines 213-255) only enriches guest metadata
                                // This is the ONLY code path that creates/updates bookings with property_id
                                const { error: bookingError } = await supabase
                                    .from('bookings')
                                    .upsert({
                                        workspace_id: property.workspace_id,
                                        property_id: property_id, // From feed's property, NOT from email
                                        source_type: feed.source_type,
                                        external_uid: uid,
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
                                    }, {
                                        onConflict: 'property_id, source_type, external_uid'
                                    });

                                if (bookingError) {
                                    console.error(`API: Failed to upsert booking ${uid}:`, bookingError);
                                } else {
                                    totalUpdated++;
                                }
                            }
                        }
                    }


                    totalEventsFound += feedEventsFound;

                    // 6. Count actual active bookings in DB for this feed
                    const { count: activeBookingCount, error: countError } = await supabase
                        .from('bookings')
                        .select('*', { count: 'exact', head: true })
                        .eq('source_feed_id', feed.id)
                        .eq('is_active', true);

                    if (countError) console.error('API: Error counting bookings:', countError);

                    // Update feed success
                    await supabase
                        .from('ical_feeds')
                        .update({
                            last_synced_at: new Date().toISOString(),
                            last_sync_status: 'success',
                            last_error: null,
                            // Debug cols
                            last_http_status: httpStatus,
                            last_content_type: contentType,
                            last_final_url: finalUrl,
                            last_response_snippet: snippet,
                            last_event_count: eventCount,
                            last_booking_count: activeBookingCount ?? 0
                        })
                        .eq('id', feed.id);

                } catch (err: any) {
                    console.error(`Error syncing feed ${feed.id}:`, err);
                    syncError = err.message || 'Unknown error';

                    // Count bookings even on error (to show what's stale in DB)
                    const { count: activeBookingCount } = await supabase
                        .from('bookings')
                        .select('*', { count: 'exact', head: true })
                        .eq('source_feed_id', feed.id)
                        .eq('is_active', true);

                    // Update feed error
                    await supabase
                        .from('ical_feeds')
                        .update({
                            last_synced_at: new Date().toISOString(),
                            last_sync_status: 'error',
                            last_error: syncError,
                            // Debug cols (capture what we have)
                            last_http_status: httpStatus,
                            last_content_type: contentType,
                            last_final_url: finalUrl,
                            last_response_snippet: snippet,
                            last_event_count: eventCount,
                            last_booking_count: activeBookingCount ?? 0
                        })
                        .eq('id', feed.id);
                }
            }

            return NextResponse.json({
                success: true,
                feeds_synced: feeds.length,
                events_found: totalEventsFound,
                processed: totalUpdated
            });

        } catch (err: any) {
            console.error('CRITICAL Sync error:', err);
            return NextResponse.json({ error: 'Internal Server Error: ' + err.message }, { status: 500 });
        }
    } catch (outerErr: any) {
        console.error('Outer Sync error:', outerErr);
        return NextResponse.json({ error: 'Internal Server Error: ' + outerErr.message }, { status: 500 });
    }
}
