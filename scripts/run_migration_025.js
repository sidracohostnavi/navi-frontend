
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
    const migrationFile = path.join(__dirname, 'migrations', '025_add_ical_name.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

    console.log('--- Executing Migration 025 ---');
    console.log(sql);
    console.log('-------------------------------');
    console.log('Please run the above SQL in your Supabase SQL Editor.');
}

runMigration();
