const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://axwepnpgkfodkyjtownf.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

const SPARK_STAY = '5fb5a1c7-916d-457b-9c39-2ce92e185a6f';
const SIDRA_AC = '81b74a8f-4f2d-4e69-9bab-72234d291910';
const WORKSPACE = '1188717b-61e1-48fc-8ba5-20242c01a0df';

(async () => {
    // 1. Insert review inbox item for Michael Walbridge
    console.log('=== 1. Adding Michael Walbridge to review inbox ===');
    const { data: existing } = await s.from('enrichment_review_items').select('id').eq('status', 'pending').filter('extracted_data->>confirmation_code', 'eq', 'HMQH8MSEQY');
    if (existing && existing.length > 0) {
        console.log('Already pending:', existing[0].id);
    } else {
        const { data, error } = await s.from('enrichment_review_items').insert({
            workspace_id: WORKSPACE,
            connection_id: SIDRA_AC,
            status: 'pending',
            extracted_data: {
                guest_name: 'Michael Walbridge',
                check_in: '2026-03-08',
                check_out: '2026-03-12',
                confirmation_code: 'HMQH8MSEQY',
                guest_count: 1,
                listing_name: 'Short-term Rental',
                gmail_message_id: 'manual-HMQH8MSEQY',
                confidence: 1.0
            }
        }).select('id').single();
        if (error) console.log('❌ Error:', error.message);
        else console.log('✅ Created:', data.id);
    }

    // 2. Fix Irfan Dolar — update fact guest_name and booking guest_name
    console.log('\n=== 2. Fixing Irfan Dolar (update name + re-enrich booking) ===');
    // Update fact
    const { error: factErr } = await s.from('reservation_facts').update({ guest_name: 'Irfan Dolar' }).eq('id', '1d240b13-5788-4caa-b864-54a39995ed2e');
    if (factErr) console.log('❌ Fact update error:', factErr.message);
    else console.log('✅ Fact guest_name updated to "Irfan Dolar"');

    // Update booking — fix guest_name and ensure enriched_from_fact = true
    const { data: bk } = await s.from('bookings').select('raw_data').eq('id', '6d856351-4655-4ec6-b4e4-17da2874f13a').single();
    const newRawData = { ...bk.raw_data, from_fact_id: '1d240b13-5788-4caa-b864-54a39995ed2e', enriched_from_fact: true, enriched_manually: true };
    const { error: bkErr } = await s.from('bookings').update({
        guest_name: 'Irfan Dolar',
        guest_first_name: 'Irfan',
        guest_last_initial: 'D',
        raw_data: newRawData
    }).eq('id', '6d856351-4655-4ec6-b4e4-17da2874f13a');
    if (bkErr) console.log('❌ Booking update error:', bkErr.message);
    else console.log('✅ Booking guest_name and raw_data updated');

    // 3. Anjuline Ruiz diagnosis
    console.log('\n=== 3. Anjuline Ruiz — Diagnosis ===');
    // The fact exists for Apr 9-12 (Aloha), code HMBTC3BFDN
    // Brown Mar 8-12 booking is a DIFFERENT booking with uid f1d1212e (no Anjuline connection)
    // Check: is there ANY booking linked to Anjuline fact?
    const { data: anjBookings } = await s.from('bookings').select('id, property_id, guest_name, check_in, check_out, raw_data, is_active').filter('raw_data->>from_fact_id', 'eq', 'db4e3147-2123-444c-85b8-2ac7d5f970d0');
    console.log('Bookings with Anjuline fact:', JSON.stringify(anjBookings, null, 2));
    // Also check Aloha Apr 9-12
    const { data: alohaApr } = await s.from('bookings').select('id, guest_name, check_in, check_out, raw_data, is_active').eq('property_id', '7208a26d-dcfe-4f63-a2e2-3c789cc58567').eq('is_active', true).gte('check_in', '2026-04-08T00:00:00Z').lte('check_in', '2026-04-10T23:59:59Z');
    console.log('Aloha Apr 9 bookings:', JSON.stringify(alohaApr, null, 2));
})();
