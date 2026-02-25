
import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
    console.error('Missing SUPABASE_DB_URL');
    process.exit(1);
}

const client = new Client({ connectionString: dbUrl });

async function auditSchema() {
    await client.connect();
    console.log('--- Connected via PG Driver ---');

    try {
        const tables = ['cohost_workspace_members'];

        for (const table of tables) {
            console.log(`\n=== Table: ${table} ===`);
            const [schema, tableName] = table.includes('.') ? table.split('.') : ['public', table];

            // Columns
            const resCols = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [schema, tableName]);

            console.log('Columns:');
            console.table(resCols.rows.map(r => ({
                name: r.column_name,
                type: r.data_type,
                null: r.is_nullable,
                default: r.column_default
            })));

            // Indexes & Constraints (via pg_indexes and pg_constraint)
            // Querying pg_indexes for simplified view
            const resIndexes = await client.query(`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE schemaname = $1 AND tablename = $2
      `, [schema, tableName]);

            console.log('Indexes:');
            resIndexes.rows.forEach(r => console.log(` - ${r.indexname}: ${r.indexdef}`));

            // Constraints
            const resConstraints = await client.query(`
        SELECT conname, pg_get_constraintdef(c.oid) as def
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = $1 AND conrelid = (SELECT oid FROM pg_class WHERE relname = $2 AND relnamespace = n.oid)
      `, [schema, tableName]);

            console.log('Constraints:');
            resConstraints.rows.forEach(r => console.log(` - ${r.conname}: ${r.def}`));

            // Check for Duplicates (Integrity Check)
            if (tableName === 'cohost_workspace_members') {
                const resDupes = await client.query(`
            SELECT count(*) as count 
            FROM (
              SELECT workspace_id, user_id, count(*) 
              FROM public.cohost_workspace_members 
              GROUP BY workspace_id, user_id 
              HAVING count(*) > 1
            ) t
          `);
                console.log(`\nDuplicate (ws, user) pairs: ${resDupes.rows[0].count}`);
            }
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

auditSchema();
