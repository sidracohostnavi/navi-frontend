import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import ical from 'node-ical';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const propertyId = '99c9875e-07c1-4e5d-bc01-3a5b9c1b0937';

    const { data: feeds } = await supabase.from('ical_feeds').select('*').eq('property_id', propertyId).eq('is_active', true);

    for (const feed of feeds || []) {
        try {
            const events = await ical.async.fromURL(feed.ical_url);

            for (const [uid, event] of Object.entries(events)) {
                if (event.type !== 'VEVENT') continue;

                // Match dates: 2026-03-18 to 2026-03-23
                const toNoonUTC = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));

                let startStr = '';
                let endStr = '';

                if (event.start) {
                    let d = new Date(event.start);
                    let start = (event.start.dateOnly || event.datetype === 'date') ? toNoonUTC(d) : d;
                    startStr = start.toISOString().split('T')[0];
                }

                if (event.end) {
                    let d = new Date(event.end);
                    let end = (event.end.dateOnly || event.datetype === 'date') ? toNoonUTC(d) : d;
                    endStr = end.toISOString().split('T')[0];
                }

                if (startStr === '2026-03-18' && endStr === '2026-03-23') {
                    console.log(`\n============================`);
                    console.log(`[MATCH FOUND] exactly matching the null reservation fact dates!`);
                    console.log(`Feed: ${feed.source_name} (${feed.id})`);
                    console.log(`UID: ${uid}`);
                    console.log(`Raw event:\n`, JSON.stringify(event, null, 2));
                }

                // Also match confirmation code just in case
                if ((event.summary && event.summary.includes('HMDQD95ZRM')) || (event.description && event.description.includes('HMDQD95ZRM'))) {
                    console.log(`\n============================`);
                    console.log(`[MATCH FOUND] matching confirmation code HMDQD95ZRM!`);
                    console.log(`Feed: ${feed.source_name} (${feed.id})`);
                    console.log(`UID: ${uid}`);
                    console.log(`Raw event:\n`, JSON.stringify(event, null, 2));
                }
            }
        } catch (e) {
            console.error("Error:", e);
        }
    }
}

main();
