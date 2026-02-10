
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

if (!process.env.SUPABASE_DB_URL) {
    console.error('Missing SUPABASE_DB_URL in .env.local');
    process.exit(1);
}

const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        await client.connect();
        console.log('Connected to DB');

        // Check if column exists
        const checkRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='connections' AND column_name='color_hex';
    `);

        if (checkRes.rows.length > 0) {
            console.log('Column color_hex already exists. Skipping.');
        } else {
            console.log('Adding color_hex column...');
            await client.query(`
        ALTER TABLE connections 
        ADD COLUMN color_hex TEXT NULL;
      `);
            console.log('Success: color_hex column added.');
        }

    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

migrate();
