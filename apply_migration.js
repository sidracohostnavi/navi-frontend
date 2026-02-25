const { Client } = require('pg');
const fs = require('fs');

async function apply() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('No SUPABASE_DB_URL or DATABASE_URL found');
    process.exit(1);
  }
  
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    const sql = fs.readFileSync('supabase/migrations/20260225000000_create_gmail_sync_log.sql', 'utf8');
    await client.query(sql);
    console.log('Migration applied successfully');
  } catch (err) {
    console.error('Error applying migration:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

apply();
