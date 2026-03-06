import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    try {
        const { data: properties, error: pErr } = await supabase.from('properties').select('id, name');
        const propsMap = properties.reduce((acc, p) => { acc[p.id] = p.name; return acc; }, {});

        const { data: feeds, error: fErr } = await supabase
            .from('ical_feeds')
            .select('id, source_name, property_id, ical_url, last_event_count, is_active')
            .eq('is_active', true)
            .order('property_id');

        const { data: bookings, error: bErr } = await supabase
            .from('bookings')
            .select('property_id, id')
            .eq('is_active', true)
            .gte('check_in', '2026-03-01T00:00:00.000Z');

        const bookingCounts = bookings.reduce((acc, b) => {
            acc[b.property_id] = (acc[b.property_id] || 0) + 1;
            return acc;
        }, {});

        console.log(`=== 1. All Active iCal Feeds ===`);
        const formattedFeeds = feeds.map(f => ({
            property: propsMap[f.property_id] || f.property_id,
            source: f.source_name,
            last_event_count: f.last_event_count
        }));
        console.table(formattedFeeds);

        console.log(`\n=== 2. Feed count vs Database count Summary ===`);
        console.log(`Property`.padEnd(30, ' ') + ` | ` + `Feeds`.padEnd(35, ' ') + ` | ` + `Total Raw Events`.padEnd(18, ' ') + ` | ` + `Bookings in DB (Mar 1+)`);
        console.log('-'.repeat(115));

        // Group feeds by property correctly this time
        const propertyToEventsMap = feeds.reduce((acc, f) => {
            if (!acc[f.property_id]) acc[f.property_id] = { sources: [], eventSum: 0 };
            acc[f.property_id].sources.push(f.source_name);
            acc[f.property_id].eventSum += (f.last_event_count || 0);
            return acc;
        }, {});

        const allPropIds = Array.from(new Set([...Object.keys(propertyToEventsMap), ...Object.keys(bookingCounts)]));

        allPropIds.forEach(propId => {
            if (propId === '22222222-2222-4222-8222-222222222222') return; // Skip test prop
            const propName = propsMap[propId] || 'Unknown';
            const feedInfo = propertyToEventsMap[propId];
            const sourceStr = feedInfo ? feedInfo.sources.join(', ') : 'No Active Feeds';
            const eventSumInFeeds = feedInfo ? feedInfo.eventSum : 0;
            const bookingsInDb = bookingCounts[propId] || 0;

            console.log(`${propName.padEnd(30, ' ')} | ${sourceStr.padEnd(35, ' ')} | ${String(eventSumInFeeds).padEnd(18, ' ')} | ${bookingsInDb}`);
        });

    } catch (e) {
        console.error("Caught error:", e);
    }
}

run().then(() => process.exit(0));
