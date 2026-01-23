
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

async function verifyTable() {
    try {
        await client.connect();

        // 1. Get a valid connection ID to rely on FK constraints
        const connRes = await client.query('SELECT id, user_id FROM public.connections LIMIT 1');
        if (connRes.rows.length === 0) {
            console.error('No connections found to test FK.');
            return;
        }
        const conn = connRes.rows[0];
        console.log(`Using Connection ID: ${conn.id}`);

        // 2. Insert dummy message
        const testId = 'test-msg-' + Date.now();
        console.log(`Attempting to insert test message: ${testId}`);

        const insertRes = await client.query(`
            INSERT INTO public.gmail_messages (
                connection_id, 
                gmail_message_id, 
                subject, 
                snippet, 
                raw_metadata, 
                processed_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING id;
        `, [
            conn.id,
            testId,
            'Test Subject',
            'Test Snippet',
            JSON.stringify({ test: true })
        ]);

        console.log(`✅ Insert successful! ID: ${insertRes.rows[0].id}`);

        // 3. Verify Read
        const countRes = await client.query(`SELECT count(*) FROM public.gmail_messages WHERE gmail_message_id = $1`, [testId]);
        console.log(`Row count verified: ${countRes.rows[0].count}`);

        // 4. Clean up
        await client.query(`DELETE FROM public.gmail_messages WHERE gmail_message_id = $1`, [testId]);
        console.log(`Cleaned up test message.`);

    } catch (err) {
        console.error('Verification Failed:', err);
    } finally {
        await client.end();
    }
}

verifyTable();
