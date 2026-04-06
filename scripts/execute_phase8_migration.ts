import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
    console.error('Error: SUPABASE_DB_URL is required in .env.local');
    process.exit(1);
}

const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

const sql = `
-- Add rental agreement column to booking_policies
ALTER TABLE booking_policies
ADD COLUMN IF NOT EXISTS rental_agreement_text TEXT;

-- Add agreement acceptance tracking to bookings
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS rental_agreement_accepted_at TIMESTAMPTZ;

-- Add to booking_holds as well (to track during checkout)
ALTER TABLE booking_holds
ADD COLUMN IF NOT EXISTS rental_agreement_accepted_at TIMESTAMPTZ;
`;

async function runMigration() {
    try {
        await client.connect();
        console.log('Connected to database.');
        console.log('Executing Phase 8 Migration...');
        await client.query(sql);
        console.log('Migration executed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
