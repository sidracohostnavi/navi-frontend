
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
    console.error('Error: SUPABASE_DB_URL is required in .env.local');
    process.exit(1);
}

const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

async function checkLogs() {
    try {
        await client.connect();
        const res = await client.query('SELECT * FROM public.support_audit_logs ORDER BY created_at DESC LIMIT 5');
        console.table(res.rows);
    } catch (err) {
        console.error('Query failed:', err);
    } finally {
        await client.end();
    }
}

checkLogs();
