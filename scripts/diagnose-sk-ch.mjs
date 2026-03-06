// Compare iCal booking vs reservation_fact checkout for Samantha Kelly and Craig Hampel
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://axwepnpgkfodkyjtownf.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const targets = [
    { name: 'Samantha Kelly', code: 'HM59N23W53' },
    { name: 'Craig Hampel', code: 'HM8WNH8JH5' }
];

async function check() {
    for (const t of targets) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`${t.name} — ${t.code}`);
        console.log('='.repeat(60));

        // Find booking(s)
        const { data: bookings } = await supabase
            .from('bookings')
            .select('id, property_id, guest_name, check_in, check_out, raw_data, source_type, platform, is_active')
            .ilike('guest_name', `%${t.name.split(' ')[0]}%`)
            .eq('is_active', true);

        if (!bookings || bookings.length === 0) {
            console.log('  ❌ No active booking found by name');
        } else {
            for (const b of bookings) {
                const bIn = b.check_in.split('T')[0];
                const bOut = b.check_out.split('T')[0];
                console.log(`\n  BOOKING:`);
                console.log(`    id: ${b.id}`);
                console.log(`    guest_name: "${b.guest_name}"`);
                console.log(`    check_in: ${bIn}   check_out: ${bOut}`);
                console.log(`    source_type: ${b.source_type}  platform: ${b.platform}`);
                console.log(`    from_fact_id: ${b.raw_data?.from_fact_id || 'MISSING'}`);
                console.log(`    enriched_from_fact: ${b.raw_data?.enriched_from_fact}`);
                console.log(`    enriched_manually: ${b.raw_data?.enriched_manually || false}`);
                console.log(`    raw_data.summary: "${b.raw_data?.summary || 'N/A'}"`);
            }
        }

        // Find fact by confirmation code
        const { data: facts } = await supabase
            .from('reservation_facts')
            .select('id, connection_id, guest_name, check_in, check_out, confirmation_code, raw_data')
            .eq('confirmation_code', t.code);

        if (!facts || facts.length === 0) {
            console.log(`\n  ❌ No reservation_fact found for code ${t.code}`);
        } else {
            for (const f of facts) {
                console.log(`\n  FACT:`);
                console.log(`    id: ${f.id}`);
                console.log(`    connection_id: ${f.connection_id}`);
                console.log(`    guest_name: "${f.guest_name}"`);
                console.log(`    check_in: ${f.check_in}   check_out: ${f.check_out}`);
                console.log(`    confirmation_code: ${f.confirmation_code}`);
            }
        }

        // Compare
        if (bookings?.length > 0 && facts?.length > 0) {
            const b = bookings[0];
            const f = facts[0];
            const bOut = b.check_in ? b.check_out.split('T')[0] : '?';
            const fOut = f.check_out || '?';
            console.log(`\n  COMPARISON:`);
            console.log(`    iCal check_out:  ${bOut}`);
            console.log(`    Fact check_out:  ${fOut}`);
            console.log(`    Match: ${bOut === fOut ? '✅ YES' : '❌ NO — off by ' + (new Date(fOut).getTime() - new Date(bOut).getTime()) / 86400000 + ' day(s)'}`);
        }
    }
}

check().catch(console.error);
