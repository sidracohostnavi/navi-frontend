const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://axwepnpgkfodkyjtownf.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // Search by name with loose date window
    console.log('=== BOOKING by name ===');
    const { data: byName } = await s.from('bookings')
        .select('id, property_id, guest_name, check_in, check_out, raw_data, source_type, platform, is_active')
        .ilike('guest_name', '%Scarlett%');
    console.log('By name:', JSON.stringify(byName, null, 2));

    // Search by date range ±1 day
    console.log('\n=== BOOKING by date range (Mar 01-03 check_in) ===');
    const { data: byDate } = await s.from('bookings')
        .select('id, property_id, guest_name, check_in, check_out, raw_data, source_type')
        .gte('check_in', '2026-03-01T00:00:00.000Z')
        .lte('check_in', '2026-03-03T23:59:59.000Z')
        .eq('is_active', true);
    for (const b of byDate || []) {
        console.log(b.guest_name + ' | ' + b.check_in.split('T')[0] + '->' + b.check_out.split('T')[0] + ' | ' + b.source_type);
    }

    // reservation_facts around that date
    console.log('\n=== FACTS (check_in Mar 01-03) ===');
    const { data: facts } = await s.from('reservation_facts')
        .select('id, connection_id, guest_name, check_in, check_out, confirmation_code')
        .gte('check_in', '2026-03-01')
        .lte('check_in', '2026-03-03');
    console.log(JSON.stringify(facts, null, 2));

    // Review items around that date
    console.log('\n=== REVIEW ITEMS (pending) ===');
    const { data: reviews } = await s.from('enrichment_review_items')
        .select('id, status, extracted_data, created_at')
        .eq('status', 'pending');
    console.log(JSON.stringify(reviews, null, 2));
})();
