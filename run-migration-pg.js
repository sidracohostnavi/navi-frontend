const { Client } = require('pg');
const fs = require('fs');

async function apply() {
  // Using the SUPABASE_SERVICE_ROLE_KEY to authenticate with connection string format
  const dbUrl = "postgresql://postgres:Qw2WDeEHQyxe5ob7Z9xLDNky1Hwu1Y1LcJ763XrV6_0@db.axwepnpgkfodkyjtownf.supabase.co:5432/postgres";
  
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    const sql = fs.readFileSync('supabase/migrations/20260317062600_add_direct_booking.sql', 'utf8');
    await client.query(sql);
    console.log('Migration applied successfully to remote database!');
  } catch (err) {
    console.error('Error applying migration:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

apply();
