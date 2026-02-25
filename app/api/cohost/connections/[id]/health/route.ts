
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: connectionId } = await params;
    const supabase = await createClient();

    try {
        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error('[Health] Auth error:', authError);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Get Connection Details
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('*')
            .eq('id', connectionId)
            .eq('user_id', user.id) // Ensure user owns this connection
            .single();

        if (connError || !connection) {
            console.error('[Health] Connection fetch error:', connError);
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        // 2. Mock Gmail Status (In real app, check if refresh_token is valid)
        // We can infer validation from recent successful fetches in gmail_messages
        const gmailConnected = !!connection.gmail_refresh_token;

        // 3. Compute Granular Status
        // Truth Table:
        // DISCONNECTED = No tokens
        // ERROR = Tokens exist but revoked/invalid (inferred from DB status or last error)
        // INCOMPLETE = Tokens valid but Label missing/invalid
        // READY = All good

        let statusDetail = 'DISCONNECTED';
        if (gmailConnected) {
            if (connection.gmail_status === 'error') {
                // Check code to differentiate Auth Error vs Config Error
                const code = connection.gmail_last_error_code;
                if (code === 'LABEL_NOT_FOUND' || code === 'LABEL_NOT_CONFIGURED') {
                    statusDetail = 'AUTHENTICATED_INCOMPLETE';
                } else {
                    statusDetail = 'ERROR'; // Revoked, etc
                }
            } else {
                statusDetail = 'READY';
            }
        }

        // Double check config state live? 
        // We rely on DB status mostly, but 'labelFound' check helps UI debugging
        const labelFound = !!connection.reservation_label;

        // 4. Calculate Stats (Live Counts)
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // Helper for counts
        const getCount = async (table: string, timeCol: string, since: string, extraFilter?: any) => {
            let q = supabase
                .from(table)
                .select('*', { count: 'exact', head: true })
                .eq('connection_id', connectionId)
                .gte(timeCol, since);

            if (extraFilter) {
                // for bookings, we don't have connection_id directly?
                // Wait, bookings are linked to property, not connection directly in schema.
                // But we have `enriched_from_fact`.
                // Actually bookings don't have connection_id column.
                // We need to query bookings via property -> connection?
                // Or we can rely on `reservation_facts` count as "parsed" and 
                // just accept that "Calendar enriched" is roughly equal to "Reservations Parsed" if sync works.
                // OR: Query `bookings` that satisfy:
                // source_feed_id IN (SELECT id FROM ical_feeds WHERE property_id IN (SELECT property_id FROM connection_properties WHERE connection_id = ...))
                // AND raw_data->>'enriched_from_fact' = 'true'
                return 0; // implemented below separately
            }

            const { count } = await q;
            return count || 0;
        };

        // Emails Fetched
        const emails24h = await getCount('gmail_messages', 'created_at', oneDayAgo);
        const emails7d = await getCount('gmail_messages', 'created_at', sevenDaysAgo);

        // Reservations Parsed
        const reservations24h = await getCount('reservation_facts', 'created_at', oneDayAgo);
        const reservations7d = await getCount('reservation_facts', 'created_at', sevenDaysAgo);

        // Calendar Enriched
        // Complex query, so let's simplify: 
        // "Calendar Enriched" is conceptually "Bookings updated with guest names". 
        // Since we upsert bookings during sync, and we enriched them using facts...
        // Let's count `bookings` where `guest_name` is not null and `platform` = 'Airbnb' (or source_type matches).
        // BUT strict "Connection Health" implies attribution to THIS connection.
        // We know `reservation_facts` are linked to this connection.
        // So "Reservations Parsed" is a good proxy for "Ready to Enrich".
        // "Calendar Enriched" can be the same number for now, or we try to find matched bookings.
        // Let's use `reservation_facts` count as the primary "Bookings" metric connection-side.
        // The user asked: "Calendar enriched = count of iCal events matched to reservation_facts".

        // Let's try to query bookings via the join.
        // connection -> connection_properties -> property -> bookings
        const { count: enriched7d } = await supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true)
            .not('guest_first_name', 'is', null) // Only count if we parsed a name
            .gte('updated_at', sevenDaysAgo)
            // Filter by properties linked to this connection
            // We can't do complex join in one request easily with this client syntax without views.
            // Let's approximate by fetching property IDs first.
            ;

        // Fetch Property IDs for this connection
        const { data: cp } = await supabase
            .from('connection_properties')
            .select('property_id')
            .eq('connection_id', connectionId);

        let enriched_24h = 0;
        let enriched_7d = 0;

        if (cp && cp.length > 0) {
            const propIds = cp.map(x => x.property_id);

            const { count: e24 } = await supabase
                .from('bookings')
                .select('*', { count: 'exact', head: true })
                .eq('is_active', true)
                .in('property_id', propIds)
                .not('guest_first_name', 'is', null)
                .gte('updated_at', oneDayAgo);

            const { count: e7 } = await supabase
                .from('bookings')
                .select('*', { count: 'exact', head: true })
                .eq('is_active', true)
                .in('property_id', propIds)
                .not('guest_first_name', 'is', null)
                .gte('updated_at', sevenDaysAgo);

            enriched_24h = e24 || 0;
            enriched_7d = e7 || 0;
        }

        const stats = {
            emails_24h: emails24h,
            emails_7d: emails7d,
            bookings_24h: enriched_24h, // Using enriched count as "Bookings"
            bookings_7d: enriched_7d
        };

        // Determine Last Scan
        // Latest gmail_message for this connection
        const { data: lastMsg } = await supabase
            .from('gmail_messages')
            .select('created_at')
            .eq('connection_id', connectionId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        return NextResponse.json({
            success: true,
            health: {
                gmail_connected: gmailConnected,
                label_found: labelFound,
                label_name: connection.reservation_label,
                status_detail: statusDetail, // New explicit status
                gmail_status: connection.gmail_status, // Raw DB status
                last_error: connection.gmail_last_error_message, // Expose error msg for UI to show tooltips
                last_scan: lastMsg?.created_at || null,
                stats,
                errors: []
            }
        });

    } catch (error: any) {
        console.error('[Health] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
