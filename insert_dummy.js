const { Client } = require('pg');
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  const wRes = await client.query('SELECT workspace_id FROM cohost_properties LIMIT 1');
  const wId = wRes.rows[0].workspace_id;
  
  const cRes = await client.query('SELECT id FROM connections LIMIT 1');
  const cId = cRes.rows[0].id;
  
  // Insert into gmail_sync_log
  await client.query(`
    INSERT INTO public.gmail_sync_log (workspace_id, connection_id, success, emails_scanned, bookings_enriched, review_items_created, duration_ms)
    VALUES ($1, $2, true, 42, 5, 1, 1250)
  `, [wId, cId]);
  
  console.log("Inserted dummy gmail log");
  
  await client.end();
}
run();
