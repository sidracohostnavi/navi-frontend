import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import ical from 'node-ical';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const propertyId = '99c9875e-07c1-4e5d-bc01-3a5b9c1b0937';
    console.log(`Fetching feeds for property: ${propertyId}`);

    // Check if any reservation facts have a null guest_name for this workspace
    const { data: facts } = await supabase.from('reservation_facts').select('*');
    if (facts) {
        const nullFacts = facts.filter(f => !f.guest_name);
        if (nullFacts.length > 0) {
            console.log("Found null facts in DB!", nullFacts);
        }
    }

    const { data: feeds } = await supabase.from('ical_feeds').select('*').eq('property_id', propertyId).eq('is_active', true);
    console.log(`Found ${feeds?.length || 0} active feeds.`);

    for (const feed of feeds || []) {
        console.log(`\n============================`);
        console.log(`Analyzing feed: ${feed.source_name} (${feed.id})`);
        console.log(`URL: ${feed.ical_url}`);

        try {
            const events = await ical.async.fromURL(feed.ical_url);
            let veventCount = 0;

            for (const [uid, event] of Object.entries(events)) {
                if (event.type !== 'VEVENT') continue;
                veventCount++;

                const summary = event.summary;
                if (summary === null) {
                    console.log(`\n[CRASH FOUND] summary is strictly null!`);
                    console.log(`UID: ${uid}`);
                    console.log(`Raw event:\n`, JSON.stringify(event, null, 2));
                    continue; // Skip the rest for this event to avoid crashing
                }

                // If summary is an object with a .val
                if (summary && typeof summary === 'object') {
                    console.log(`\n[CRASH AT RISK] summary is an object:`, summary);
                    console.log(`UID: ${uid}`);
                    console.log(`Raw event:\n`, JSON.stringify(event, null, 2));
                }
            }
            console.log(`Processed ${veventCount} VEVENTs. No null summary found directly.`);
        } catch (e) {
            console.error("Error processing feed:", e);
        }
    }
}

main();
