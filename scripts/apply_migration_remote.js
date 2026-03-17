const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('Reading migration file...');
  const sql = fs.readFileSync('supabase/migrations/20260317062600_add_direct_booking.sql', 'utf8');
  
  // We can't directly execute DDL SQL via the standard supabase-js client 
  // without a custom RPC function. So this script won't work for schema changes.
  console.log('Note: Supabase JS client cannot execute raw DDL queries by default.');
  console.log('Please run the migration manually via the Supabase Dashboard SQL Editor.');
}

applyMigration();
