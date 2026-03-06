// Backfill from_fact_id into enriched bookings
// Run with: node scripts/run-backfill.mjs
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://axwepnpgkfodkyjtownf.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfill() {
    // Step 1: Get enriched bookings missing from_fact_id
    const { data: bookings, error: bErr } = await supabase
        .from('bookings')
        .select('id, property_id, guest_name, check_in, check_out, raw_data')
        .eq('is_active', true)
        .not('raw_data', 'is', null);

    if (bErr) { console.error('Bookings error:', bErr); return; }

    const candidates = bookings.filter(b =>
        b.raw_data?.enriched_from_fact === true && !b.raw_data?.from_fact_id
    );

    console.log(`Enriched but missing from_fact_id: ${candidates.length}`);
    if (candidates.length === 0) { console.log('Nothing to backfill.'); return; }

    // Step 2: Get connection_properties mapping
    const propIds = [...new Set(candidates.map(b => b.property_id))];
    const { data: cpData } = await supabase
        .from('connection_properties')
        .select('property_id, connection_id')
        .in('property_id', propIds);

    const propToConnections = new Map();
    (cpData || []).forEach(cp => {
        if (!propToConnections.has(cp.property_id)) propToConnections.set(cp.property_id, []);
        propToConnections.get(cp.property_id).push(cp.connection_id);
    });

    // Step 3: Match and update
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const b of candidates) {
        const connectionIds = propToConnections.get(b.property_id) || [];
        if (connectionIds.length === 0) { skipped++; continue; }

        const bCheckIn = b.check_in.split('T')[0];
        const bCheckOut = b.check_out.split('T')[0];

        const { data: facts } = await supabase
            .from('reservation_facts')
            .select('id, connection_id')
            .in('connection_id', connectionIds)
            .eq('check_in', bCheckIn)
            .eq('check_out', bCheckOut);

        if (!facts || facts.length !== 1) { skipped++; continue; }

        // Safe unique match — update raw_data with from_fact_id
        const newRawData = { ...b.raw_data, from_fact_id: facts[0].id };
        const { error: updateErr } = await supabase
            .from('bookings')
            .update({ raw_data: newRawData })
            .eq('id', b.id);

        if (updateErr) {
            console.error(`❌ Failed: ${b.id} | ${b.guest_name} | ${updateErr.message}`);
            errors++;
        } else {
            console.log(`✅ Updated: ${b.id} | "${b.guest_name}" | ${bCheckIn}→${bCheckOut} | fact_id: ${facts[0].id}`);
            updated++;
        }
    }

    console.log(`\n--- BACKFILL COMPLETE ---`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
}

backfill().catch(console.error);
