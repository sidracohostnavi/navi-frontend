import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("--- FINDING RECENT RESERVATION FACT ---");
    const { data: facts } = await supabase
        .from('reservation_facts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (!facts || facts.length === 0) {
        console.log("No facts found.");
        return;
    }

    // Trying to find the "Eric" booking fact based on the UI screenshot showing Eric's bookings
    const recentFact = facts.find(f => f.guest_name === 'Eric') || facts[0];

    console.log("Found Fact:");
    console.log(`id: ${recentFact.id}`);
    console.log(`confirmation_code: ${recentFact.confirmation_code}`);
    console.log(`check_in / check_out: ${recentFact.check_in} / ${recentFact.check_out}`);
    console.log(`guest_name: ${recentFact.guest_name}`);
    console.log(`property_id: ${recentFact.property_id || 'NULL'}`);
    console.log(`connection_id: ${recentFact.connection_id}`);
    console.log(`created_at: ${recentFact.created_at}`);
    console.log(`source_gmail_message_id: ${recentFact.source_gmail_message_id}`);

    console.log("\n--- FINDING AFFECTED BOOKINGS ---");
    // Since we know the dates in the screenshot are around March 12-16 for Eric (from UI it looks like checkin Mar 12, checkout Mar 16)
    // Or we just query all bookings whose guest_name is the fact's guest name (e.g. Eric) or matched based on external_uid logic recently

    const { data: bookings } = await supabase
        .from('bookings')
        .select('id, property_id, check_in, check_out, guest_name, guest_count, matched_connection_id, manual_connection_id, manual_guest_name, last_synced_at')
        .eq('guest_name', recentFact.guest_name);

    console.log("Bookings enriched with this name:");
    bookings?.forEach(b => {
        console.log(`Booking ID: ${b.id} | Prop ID: ${b.property_id} | In: ${b.check_in} | Out: ${b.check_out} | Name: ${b.guest_name} | Count: ${b.guest_count} | MatchedCx: ${b.matched_connection_id} | Manual: ${!!b.manual_guest_name} | Updated: ${b.last_synced_at}`);
    });
}
main();
