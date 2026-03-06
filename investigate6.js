const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function check() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const bookingId = '5fc990b4-3807-4b73-81b4-27e23fe2ff47';

    // 1. Raw DB row
    const { data: row } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
    console.log("=== 1️⃣ RAW DB ROW ===");
    console.log(JSON.stringify(row, null, 2));

    // 2. We need to query the API to see the payload. But we need an auth token.
    // Instead of hitting the API directly with an auth token, we can just print the exact logic from route.ts that does the enrichment.
    
    // Check if there are facts matching the dates in the workspace
    if (row) {
        const inDate = new Date(row.check_in).toISOString().slice(0, 10);
        const outDate = new Date(row.check_out).toISOString().slice(0, 10);
        
        console.log(`\n=== 2️⃣ RENDER-TIME ENRICHMENT SIMULATION ===`);
        console.log(`Looking for facts with check_in=${inDate} and check_out=${outDate} in workspace ${row.workspace_id}`);
        
        // Find connection IDs for the workspace
        const { data: conns } = await supabase.from('connections').select('id').eq('workspace_id', row.workspace_id);
        const connIds = conns.map(c => c.id);
        
        const { data: facts } = await supabase.from('reservation_facts')
            .select('id, guest_name, check_in, check_out, connection_id')
            .in('connection_id', connIds)
            .eq('check_in', inDate)
            .eq('check_out', outDate);
            
        console.log("Facts found matching dates in workspace:");
        console.log(JSON.stringify(facts, null, 2));
        
        if (facts && facts.length === 1) {
            console.log("\n-> API Route Logic: `candidates.length === 1` is TRUE");
            console.log(`-> API Route applies guest_name = "${facts[0].guest_name}" to booking ${row.id}`);
            
            const apiResult = {
                ...row,
                guest_name: facts[0].guest_name,
                type: 'booking',
                matched_connection_id: facts[0].connection_id
            };
            console.log("\n=== 3️⃣ OBJECT SENT TO FRONTEND ===");
            console.log(JSON.stringify(apiResult, null, 2));
        } else {
            console.log("\n-> Candidates length != 1, no render-time enrichment applied.");
        }
    }
}
check();
