
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

        const migrationPath = path.join(__dirname, 'migrations', '052_add_user_properties.sql');
        console.log('Reading migration from:', migrationPath);

        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('--- Executing Migration 052 ---');

        await client.query(sql);

        console.log('Migration executed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
