
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
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    try {
        await client.connect();
        console.log('Connected to database.');

        const migrationPath = path.join(__dirname, 'migrations', '045_connection_oauth_logging.sql');
        console.log('Reading migration from:', migrationPath);

        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('--- Executing Migration 045 ---');
        console.log('Adding columns: gmail_last_success_at, color');
        console.log('Updating gmail_status CHECK constraint to include needs_reconnect');

        await client.query(sql);

        console.log('Migration executed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
