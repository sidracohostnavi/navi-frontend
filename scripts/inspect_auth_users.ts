
import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
    console.error('Missing SUPABASE_DB_URL in .env.local');
    process.exit(1);
}

const client = new Client({ connectionString: dbUrl });

async function inspectAuth() {
    console.log('--- Inspecting auth.users ---');
    await client.connect();

    try {
        // 1. Search for specific user (sidravines@gmail.com)
        // 2. Search for ANY soft deleted users
        const query = `
      SELECT id, email, role, created_at, last_sign_in_at, deleted_at, is_sso_user
      FROM auth.users 
      WHERE email ILIKE '%sidravines%' 
         OR deleted_at IS NOT NULL
      ORDER BY created_at DESC;
    `;

        const res = await client.query(query);

        if (res.rows.length === 0) {
            console.log('No matching rows found in auth.users (for sidravines or deleted_at NOT NULL).');
        } else {
            console.table(res.rows.map(r => ({
                id: r.id,
                email: r.email,
                deleted: r.deleted_at ? 'YES (' + r.deleted_at.toISOString() + ')' : 'NO',
                role: r.role,
                created: r.created_at ? r.created_at.toISOString() : 'N/A'
            })));
        }

        // 3. Verify Project Ref via current_database() or similar? 
        // Actually best proxy for "which DB am I" is usually just the URL, but inside SQL we can check:
        // SELECT inet_server_addr(), inet_server_port(); 
        // or just assume if we connected, we are in the DB defined by SUPABASE_DB_URL.

    } catch (err: any) {
        console.error('Query Failed:', err.message);
    } finally {
        await client.end();
    }
}

inspectAuth();
