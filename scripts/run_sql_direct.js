
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
    console.error('Error: SUPABASE_DB_URL is required in .env.local');
    process.exit(1);
}

const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false } // Supabase requires SSL, usually self-signed or CA check
});

async function runMigration() {
    try {
        await client.connect();
        console.log('Connected to database.');

        // Debug: Check connections table columns
        const res = await client.query('SELECT * FROM public.connections LIMIT 1');
        if (res.rows.length > 0) {
            console.log('Connections columns:', Object.keys(res.rows[0]));
        } else {
            console.log('Connections table empty, checking schema via metadata?');
            // Fallback to information_schema
            const schemaRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'connections'");
            console.log('Schema columns:', schemaRes.rows.map(r => r.column_name));
        }

        const migrationFile = path.join(__dirname, 'migrations', '038_create_gmail_ingestion_tables.sql');
        const sql = fs.readFileSync(migrationFile, 'utf8');

        console.log('--- Executing Migration 038 ---');

        await client.query(sql);

        console.log('Migration executed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
