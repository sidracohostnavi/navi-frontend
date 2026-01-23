
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
    const migrationFile = path.join(__dirname, 'migrations', '038_create_gmail_ingestion_tables.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

    console.log('--- Executing Migration 038 ---');

    // Split by semicolons simple approach to run one by one if rpc supports multiple or single?
    // Usually exec_sql rpc takes a block.
    // However, rpc exec_sql implementations vary. If it's a simple `plpgsql` executing string, it supports multi-statement.

    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
        console.warn('RPC exec_sql failed:', error);
        console.warn('Message:', error.message);
        console.warn('Details:', error.details);
    } else {
        console.log('Migration succeeded via RPC.');
    }
}

runMigration();
