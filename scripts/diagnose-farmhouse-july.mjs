import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const propertyId = '3596be29-8b42-456f-9fb1-85625a34c946';

    const { data, error } = await supabase
        .from('bookings')
        .select('id, guest_name, check_in, check_out, external_uid, source_type, is_active, raw_data')
        .eq('property_id', propertyId)
        .gte('check_in', '2026-07-04T00:00:00.000Z')
        .lte('check_in', '2026-07-07T23:59:59.000Z')
        .order('check_in', { ascending: true });

    if (error) {
        console.error("Error fetching bookings:", error);
        return;
    }

    console.log(`Found ${data.length} bookings:\n`);
    data.forEach(b => {
        console.log(`ID: ${b.id}`);
        console.log(`Guest: ${b.guest_name}`);
        console.log(`Check In: ${b.check_in.split('T')[0]}`);
        console.log(`Check Out: ${b.check_out.split('T')[0]}`);
        console.log(`UID: ${b.external_uid}`);
        console.log(`Source Type: ${b.source_type}`);
        console.log(`Active: ${b.is_active}`);
        console.log(`Raw Data: ${JSON.stringify(b.raw_data, null, 2)}`);
        console.log('-'.repeat(40));
    });
}

run().then(() => process.exit(0));
