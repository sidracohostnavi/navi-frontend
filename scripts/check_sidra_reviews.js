
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

async function checkReviewItems() {
    try {
        await client.connect();
        const workspaceId = '1188717b-61e1-48fc-8ba5-20242c01a0df';

        console.log(`Checking review items for Sidra's Workspace: ${workspaceId}`);

        const res = await client.query(
            'SELECT count(*) FROM enrichment_review_items WHERE workspace_id = $1',
            [workspaceId]
        );

        const count = res.rows[0].count;
        console.log(`\n>>> Review Items Count: ${count} <<<\n`);

        if (parseInt(count) > 0) {
            const items = await client.query(
                'SELECT id, status, created_at, extracted_data FROM enrichment_review_items WHERE workspace_id = $1 LIMIT 3',
                [workspaceId]
            );
            console.log('Sample items:', items.rows);
        }

    } catch (err) {
        console.error('Query failed:', err);
    } finally {
        await client.end();
    }
}

checkReviewItems();
