
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

async function findDuplicates() {
    try {
        await client.connect();
        const workspaceId = '1188717b-61e1-48fc-8ba5-20242c01a0df';

        console.log(`Checking duplicates for Sidra's Workspace: ${workspaceId}`);

        // Find overlapping bookings for the same property
        const query = `
            SELECT b1.id as b1_id, b1.guest_name as b1_name, b1.check_in, b1.check_out, 
                   b2.id as b2_id, b2.guest_name as b2_name
            FROM bookings b1
            JOIN bookings b2 ON b1.property_id = b2.property_id 
                            AND b1.id != b2.id
                            AND b1.check_in = b2.check_in 
                            AND b1.check_out = b2.check_out
            JOIN cohost_properties p ON b1.property_id = p.id
            WHERE p.workspace_id = $1
              AND b1.is_active = true
              AND b2.is_active = true
              AND (
                  b1.guest_name NOT IN ('Not Available', 'Reserved', 'Blocked') OR
                  b2.guest_name NOT IN ('Not Available', 'Reserved', 'Blocked')
              )
            LIMIT 5;
        `;

        const res = await client.query(query, [workspaceId]);

        console.log(`\n>>> Duplicate Sets Found: ${res.rows.length} <<<\n`);
        res.rows.forEach(r => {
            console.log(`Date: ${r.check_in} -> ${r.check_out}`);
            console.log(`  1. ${r.b1_name} (${r.b1_id})`);
            console.log(`  2. ${r.b2_name} (${r.b2_id})`);
            console.log('---');
        });

    } catch (err) {
        console.error('Query failed:', err);
    } finally {
        await client.end();
    }
}

findDuplicates();
