import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://axwepnpgkfodkyjtownf.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    // Get the fact
    const { data: fact } = await supabase
        .from('reservation_facts')
        .select('id, connection_id, guest_name, check_in, check_out')
        .eq('confirmation_code', 'HMJD9S5BM2')
        .single();

    console.log('FACT:', JSON.stringify(fact, null, 2));

    // Get the booking
    const { data: booking } = await supabase
        .from('bookings')
        .select('id, guest_name, check_in, check_out, raw_data')
        .eq('id', '5f05cd9c-0217-4a35-96b0-ef2498f2eada')
        .single();

    const bIn = booking.check_in.split('T')[0];
    const bOut = booking.check_out.split('T')[0];
    console.log(`\nBOOKING: "${booking.guest_name}" | ${bIn} → ${bOut}`);
    console.log('raw_data:', JSON.stringify(booking.raw_data, null, 2));
    console.log(`\nDates match: check_in=${bIn === fact.check_in} check_out=${bOut === fact.check_out}`);
}
check().catch(console.error);
