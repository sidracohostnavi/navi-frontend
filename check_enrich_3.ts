import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: bookings } = await supabase
        .from('bookings')
        .select(`
            id, property_id, check_in, check_out, guest_name, guest_count, 
            matched_connection_id, manual_connection_id, manual_guest_name, last_synced_at,
            cohost_properties ( name )
        `)
        .gte('check_in', '2026-03-11')
        .lte('check_in', '2026-03-14');

    console.log("Bookings around March 12-14 in DB:");
    bookings?.forEach(b => {
        // @ts-ignore
        console.log(`ID: ${b.id.slice(0, 8)}... | ${b.cohost_properties?.name} | In: ${b.check_in.split('T')[0]} | Out: ${b.check_out.split('T')[0]} | Name: ${b.guest_name} | Match ID: ${b.matched_connection_id}`);
    });
}
main();
