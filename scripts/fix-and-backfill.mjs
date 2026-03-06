// Fix 5 broken facts (-1 day checkout) then re-run backfill for remaining bookings
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://axwepnpgkfodkyjtownf.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const codes = ['HM8WNH8JH5', 'HMJD9S5BM2', 'HM2H4Y5MSD', 'HMN2Q89SMA', 'HM83SJYRZN'];

async function run() {
    // Step 1: Fix the 5 facts — subtract 1 day from check_out
    console.log('=== STEP 1: Fix 5 reservation_facts checkout dates ===\n');

    for (const code of codes) {
        const { data: fact } = await supabase
            .from('reservation_facts')
            .select('id, guest_name, check_in, check_out, confirmation_code')
            .eq('confirmation_code', code)
            .single();

        if (!fact) { console.log(`❌ No fact found for ${code}`); continue; }

        const oldOut = fact.check_out;
        const newOut = new Date(new Date(oldOut).getTime() - 86400000).toISOString().split('T')[0];

        const { error } = await supabase
            .from('reservation_facts')
            .update({ check_out: newOut })
            .eq('id', fact.id);

        if (error) {
            console.log(`❌ ${code} | ${fact.guest_name} | Error: ${error.message}`);
        } else {
            console.log(`✅ ${code} | ${fact.guest_name} | ${oldOut} → ${newOut}`);
        }
    }

    // Step 2: Re-run backfill for remaining bookings
    console.log('\n=== STEP 2: Backfill from_fact_id for remaining bookings ===\n');

    const { data: bookings } = await supabase
        .from('bookings')
        .select('id, property_id, guest_name, check_in, check_out, raw_data')
        .eq('is_active', true)
        .not('raw_data', 'is', null);

    const candidates = bookings.filter(b =>
        b.raw_data?.enriched_from_fact === true && !b.raw_data?.from_fact_id
    );

    console.log(`Remaining bookings needing from_fact_id: ${candidates.length}`);
    if (candidates.length === 0) { console.log('Nothing to backfill.'); return; }

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

    let updated = 0, skipped = 0, errors = 0;

    for (const b of candidates) {
        const connectionIds = propToConnections.get(b.property_id) || [];
        if (connectionIds.length === 0) { skipped++; continue; }

        const bIn = b.check_in.split('T')[0];
        const bOut = b.check_out.split('T')[0];

        const { data: facts } = await supabase
            .from('reservation_facts')
            .select('id')
            .in('connection_id', connectionIds)
            .eq('check_in', bIn)
            .eq('check_out', bOut);

        if (!facts || facts.length !== 1) { skipped++; continue; }

        const { error: updateErr } = await supabase
            .from('bookings')
            .update({ raw_data: { ...b.raw_data, from_fact_id: facts[0].id } })
            .eq('id', b.id);

        if (updateErr) {
            console.log(`❌ ${b.id} | ${b.guest_name} | ${updateErr.message}`);
            errors++;
        } else {
            console.log(`✅ ${b.id} | "${b.guest_name}" | ${bIn}→${bOut} | fact_id: ${facts[0].id}`);
            updated++;
        }
    }

    console.log(`\n--- BACKFILL COMPLETE ---`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
}

run().catch(console.error);
