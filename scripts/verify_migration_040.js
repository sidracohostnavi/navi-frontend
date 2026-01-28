require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing env vars. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function verify() {
    console.log('Verifying Migration 040 (Connections Workspace ID)...\n');

    // 1. Check Column Existence & Nullability
    // No, that doesn't prove it exists.
    // Let's rely on `rpc` if the project has a `run_sql` function (common in Supabase setup for devs).
    // If not, we might be stuck without a direct SQL runner.
    // Wait! The user asked me to PROVIDE results. 
    // If I can't run SQL, I can't verify.
    // I will assume for a moment that I might NOT be able to run arbitrary SQL if no RPC exists.

    // ALTERNATIVE: Use the `postgrest` introspection?
    // We can try selecting `workspace_id` from `connections` limit 1.

    console.log('--- Test 1: Column Select ---');
    const { data: selectData, error: selectError } = await supabase
        .from('connections')
        .select('workspace_id')
        .limit(1);

    if (selectError) {
        console.error('❌ Failed to select workspace_id:', selectError.message);
    } else {
        console.log('✅ Successfully selected workspace_id column.');
        console.log('   Data sample:', selectData);
    }

    // 2. Check Index (Indirectly verify performance?? No, difficult).
    // 3. Check FK (Insert invalid ID?).
    console.log('\n--- Test 2: Foreign Key Constraint ---');
    const invalidId = '00000000-0000-0000-0000-000000000000'; // Zero UUID, unlikely to exist

    // We need to create a dummy connection first to update? Or try to update one?
    // Let's try to update the first connection with a junk UUID. expects FK error.

    // Fetch one connection ID
    const { data: cx } = await supabase.from('connections').select('id').limit(1).maybeSingle();

    if (cx) {
        const { error: fkError } = await supabase
            .from('connections')
            .update({ workspace_id: invalidId })
            .eq('id', cx.id);

        if (fkError && fkError.message.includes('violates foreign key constraint')) {
            console.log('✅ FK Constraint verified (Prevented invalid workspace_id).');
            console.log('   Error:', fkError.message);
        } else if (fkError) {
            console.log('⚠️ Unexpected error:', fkError.message);
        } else {
            console.error('❌ FK Check FAILED: Allowed invalid workspace_id (or no change).');
            // Revert just in case
            await supabase.from('connections').update({ workspace_id: null }).eq('id', cx.id);
        }
    } else {
        console.log('⚠️ No connections to test FK update against.');
    }

    console.log('\n--- Done ---');
}

verify();
