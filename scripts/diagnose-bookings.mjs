// Diagnostic: Check why specific bookings didn't match in backfill
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://axwepnpgkfodkyjtownf.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const names = ['Antonio Martinez', 'Alexandra Faure', 'Drashti Patel', 'Laura Luedecke'];

async function diagnose() {
    for (const name of names) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`BOOKING: "${name}"`);
        console.log('='.repeat(60));

        // Find booking
        const { data: bookings } = await supabase
            .from('bookings')
            .select('id, property_id, guest_name, check_in, check_out, raw_data, is_active, source_type, platform')
            .ilike('guest_name', `%${name}%`)
            .eq('is_active', true);

        if (!bookings || bookings.length === 0) {
            console.log('❌ No active booking found');
            continue;
        }

        for (const b of bookings) {
            const bIn = b.check_in.split('T')[0];
            const bOut = b.check_out.split('T')[0];
            console.log(`\n  booking_id: ${b.id}`);
            console.log(`  property_id: ${b.property_id}`);
            console.log(`  check_in: ${bIn}  check_out: ${bOut}`);
            console.log(`  source_type: ${b.source_type}  platform: ${b.platform}`);
            console.log(`  raw_data:`, JSON.stringify(b.raw_data, null, 4));

            // Check enriched_from_fact
            const isEnriched = b.raw_data?.enriched_from_fact === true;
            const hasFactId = !!b.raw_data?.from_fact_id;
            console.log(`  enriched_from_fact: ${isEnriched}  has from_fact_id: ${hasFactId}`);

            // Get connections linked to this property
            const { data: cpData } = await supabase
                .from('connection_properties')
                .select('connection_id')
                .eq('property_id', b.property_id);

            const connectionIds = (cpData || []).map(cp => cp.connection_id);
            console.log(`  connections linked to property: ${connectionIds.length} → [${connectionIds.join(', ')}]`);

            if (connectionIds.length === 0) {
                console.log('  ❌ No connections linked to this property — cannot match facts');
                continue;
            }

            // Search for matching facts by exact dates
            const { data: exactFacts } = await supabase
                .from('reservation_facts')
                .select('id, connection_id, guest_name, check_in, check_out, confirmation_code')
                .in('connection_id', connectionIds)
                .eq('check_in', bIn)
                .eq('check_out', bOut);

            console.log(`  facts matching exact dates (${bIn} → ${bOut}): ${exactFacts?.length || 0}`);
            if (exactFacts && exactFacts.length > 0) {
                for (const f of exactFacts) {
                    console.log(`    fact_id: ${f.id} | connection: ${f.connection_id} | guest: "${f.guest_name}" | code: ${f.confirmation_code}`);
                }
            }

            // Also search for facts by guest name (broader search)
            const { data: nameFacts } = await supabase
                .from('reservation_facts')
                .select('id, connection_id, guest_name, check_in, check_out, confirmation_code')
                .ilike('guest_name', `%${name.split(' ')[0]}%`);

            console.log(`  facts matching guest first name "${name.split(' ')[0]}": ${nameFacts?.length || 0}`);
            if (nameFacts && nameFacts.length > 0) {
                for (const f of nameFacts) {
                    console.log(`    fact_id: ${f.id} | connection: ${f.connection_id} | guest: "${f.guest_name}" | dates: ${f.check_in}→${f.check_out} | code: ${f.confirmation_code}`);
                }
            }
        }
    }
}

diagnose().catch(console.error);
