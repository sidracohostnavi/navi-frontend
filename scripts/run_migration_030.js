
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
    const migrationFile = path.join(__dirname, 'migrations', '030_ical_debug_columns.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

    console.log('--- Executing Migration 030 ---');
    console.log(sql);

    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
        console.warn('RPC exec_sql failed:', error.message);
        console.warn('Attempting direct SQL execution via postgres connection is not supported in this script.');
    } else {
        console.log('Migration succeeded via RPC.');
    }
}

runMigration();
