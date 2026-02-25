import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("--- FINDING AFFECTED BOOKINGS ---");
    // The previous query failed because guest_name might be "Reservation" but enriched in the API
    // Let's find all bookings from Mar 10 to Mar 20 to see what the raw DB holds.
    const { data: bookings } = await supabase
        .from('bookings')
        .select('id, property_id, check_in, check_out, guest_name, guest_count, matched_connection_id, manual_connection_id, manual_guest_name')
        .gte('check_in', '2026-03-10')
        .lte('check_in', '2026-03-20');

    console.log("Bookings around March 13-16:");
    bookings?.forEach(b => {
        console.log(`Booking ID: ${b.id} | Prop ID: ${b.property_id} | In: ${b.check_in} | Out: ${b.check_out} | DB guest_name: ${b.guest_name} | MatchedCx: ${b.matched_connection_id}`);
    });
}
main();
