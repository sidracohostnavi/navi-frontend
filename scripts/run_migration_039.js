
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

        const migrationFile = path.join(__dirname, 'migrations', '039_add_guest_count_to_bookings.sql');

        if (!fs.existsSync(migrationFile)) {
            console.error('Migration file not found:', migrationFile);
            process.exit(1);
        }

        const sql = fs.readFileSync(migrationFile, 'utf8');

        console.log('--- Executing Migration 039 ---');
        console.log(sql);

        await client.query(sql);

        console.log('Migration executed successfully.');

        // Also force schema cache reload?
        await client.query(`NOTIFY pgrst, 'reload schema';`);
        console.log('Notified PostgREST to reload schema.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
