require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing env vars.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runPreflight() {
    console.log('=== Phase 3: RLS Preflight Checks ===\n');

    // 1. Confirm Active Workspace Storage
    console.log('--- Check 1: Active Workspace Storage ---');
    // We expect cohost_user_preferences table with workspace_id
    const { data: prefSample, error: prefError } = await supabase
        .from('cohost_user_preferences')
        .select('user_id, workspace_id')
        .limit(3);

    if (prefError) {
        console.error('❌ cohost_user_preferences access failed:', prefError.message);
    } else {
        console.log('✅ cohost_user_preferences accessible.');
        console.log('   Sample:', prefSample);
    }

    // 2. Count Orphans
    console.log('\n--- Check 2: Orphan Count ---');
    const { count: orphanCount, error: countError } = await supabase
        .from('connections')
        .select('*', { count: 'exact', head: true })
        .is('workspace_id', null);

    if (countError) {
        console.error('❌ Failed to count orphans:', countError.message);
    } else {
        console.log(`ℹ️ Connections with NULL workspace_id: ${orphanCount}`);
        if (orphanCount === 1) console.log('✅ Matches expectation (1 orphan).');
        else console.warn(`⚠️ Mismatch expectation (Expected 1, found ${orphanCount})`);
    }

    // 3. Verify Membership for existing connections?
    // We can just query `cohost_workspace_members` to see if we can link users to their connection workspaces.
    // Not strictly necessary if we rely on RLS, but good sanity check.

    console.log('\n--- Done ---');
}

runPreflight();
