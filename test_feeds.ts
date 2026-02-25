import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import ical from 'node-ical';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
    const propertyId = '99c9875e-07c1-4e5d-bc01-3a5b9c1b0937';
    const { data: feeds } = await supabase.from('ical_feeds').select('*').eq('property_id', propertyId);
    
    for (const feed of feeds || []) {
        console.log(`\n--- Fetching feed: ${feed.source_name} ---`);
        const events = await ical.async.fromURL(feed.ical_url);
        
        for (const [uid, event] of Object.entries(events)) {
            if (event.type !== 'VEVENT') continue;

            // Mimic logic
            const summary = event.summary || 'Blocked';
            let guestName: any = summary; // Initially set to summary

            if (guestName === null || guestName === undefined) {
                console.log("FOUND NULL guestName initially!");
                console.log("UID:", uid);
                console.log("Raw event:", JSON.stringify(event, null, 2));
                return;
            }

            // In actual logic, if matchedFact is not found, we do:
            // if (summary.includes('Reserved') || summary.toLowerCase().includes('blocking'))
            
            // Wait, does summary itself have no toLowerCase?
            // If summary is an object like { val: '...' }?
            if (typeof summary !== 'string') {
                console.log("SUMMARY IS NOT A STRING!");
                console.log("UID:", uid);
                console.log("Raw summary:", summary);
                console.log("event:", JSON.stringify(event, null, 2));
            }
        }
    }
}
main();
