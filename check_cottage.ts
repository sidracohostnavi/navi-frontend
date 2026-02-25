import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
    console.log("Fetching Green Cottage...");
    const { data: properties, error } = await supabase.from('cohost_properties').select('id, name').ilike('name', '%Green Cottage%');
    console.log('Properties:', properties);
    if (error) console.error('Error:', error);

    if (properties && properties.length > 0) {
        const propId = properties[0].id;
        console.log("Green Cottage Property ID:", propId);

        const { data: bookings } = await supabase.from('bookings')
            .select('id, property_id, check_in, check_out, guest_name, platform, source_type, source_feed_id')
            .eq('property_id', propId)
            .is('guest_name', null);

        console.log("Bookings with null guest_name:", bookings?.length);
        console.log(bookings);

        const { data: feeds } = await supabase.from('ical_feeds').select('*').eq('property_id', propId);
        console.log("Feeds:", feeds?.length);
        console.log(feeds?.map(f => ({ id: f.id, name: f.name, source: f.source_name })));
    }
}
main();
