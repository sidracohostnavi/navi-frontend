
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
    const migrationFile = path.join(__dirname, 'migrations', '026_enrichment_review_items.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

    console.log('--- Executing Migration 026 ---');
    console.log(sql);

    const { error } = await supabase.rpc('exec_sql', { sql }); // Try RPC first if enabled, or just warn
    // Note: Standard Supabase clients can't run DDL via 'rpc' unless a custom function exists.
    // We assume the user runs this, or we rely on the user to run it via SQL Editor as per previous interactions.
    // But printing it is the standard protocol here.

    console.log('-------------------------------');
    console.log('Please run the above SQL in your Supabase SQL Editor.');
}

runMigration();
