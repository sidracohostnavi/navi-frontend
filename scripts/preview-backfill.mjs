// Temporary script to preview backfill candidates
// Run with: node scripts/preview-backfill.mjs
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://axwepnpgkfodkyjtownf.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function preview() {
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

    console.log(`\nTotal active bookings: ${bookings.length}`);
    console.log(`Enriched but missing from_fact_id: ${candidates.length}\n`);

    if (candidates.length === 0) {
        console.log('Nothing to backfill.');
        return;
    }

    // Step 2: Get connection_properties for property→connection mapping
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

    // Step 3: For each candidate, find matching fact
    let matchCount = 0;
    let ambiguousCount = 0;
    let noMatchCount = 0;

    for (const b of candidates) {
        const connectionIds = propToConnections.get(b.property_id) || [];
        if (connectionIds.length === 0) {
            noMatchCount++;
            continue;
        }

        const bCheckIn = b.check_in.split('T')[0];
        const bCheckOut = b.check_out.split('T')[0];

        const { data: facts } = await supabase
            .from('reservation_facts')
            .select('id, connection_id, guest_name, check_in, check_out')
            .in('connection_id', connectionIds)
            .eq('check_in', bCheckIn)
            .eq('check_out', bCheckOut);

        if (!facts || facts.length === 0) {
            noMatchCount++;
        } else if (facts.length === 1) {
            matchCount++;
            console.log(`✅ MATCH: booking ${b.id} | "${b.guest_name}" | ${bCheckIn}→${bCheckOut} | fact_id: ${facts[0].id} | fact_connection: ${facts[0].connection_id}`);
        } else {
            ambiguousCount++;
            console.log(`⚠️  AMBIGUOUS: booking ${b.id} | "${b.guest_name}" | ${bCheckIn}→${bCheckOut} | ${facts.length} facts matched`);
        }
    }

    console.log(`\n--- SUMMARY ---`);
    console.log(`Unique matches (safe to backfill): ${matchCount}`);
    console.log(`Ambiguous (skipped): ${ambiguousCount}`);
    console.log(`No match found: ${noMatchCount}`);
}

preview().catch(console.error);
