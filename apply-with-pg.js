const { Client } = require('pg');
const fs = require('fs');

async function apply() {
  const connectionString = 'postgres://postgres.axwepnpgkfodkyjtownf:B^2d%G&v.9-n$aR@aws-0-us-west-1.pooler.supabase.com:6543/postgres';
  
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const sql = fs.readFileSync('supabase/migrations/20260317062600_add_direct_booking.sql', 'utf8');
    await client.query(sql);
    console.log('Migration applied successfully to remote database!');
  } catch (err) {
    console.error('Error applying migration:', err.message);
  } finally {
    await client.end();
  }
}

apply();
