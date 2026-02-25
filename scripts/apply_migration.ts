
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
    console.error('Missing SUPABASE_DB_URL in .env.local');
    process.exit(1);
}

const fileArg = process.argv[2];
if (!fileArg) {
    console.error('Usage: tsx scripts/apply_migration.ts <path-to-sql-file>');
    process.exit(1);
}

const migrationFile = path.resolve(process.cwd(), fileArg);
const sql = fs.readFileSync(migrationFile, 'utf8');

async function runMigration() {
    console.log(`Running SQL from: ${migrationFile}`);
    const client = new Client({ connectionString: dbUrl });

    try {
        await client.connect();
        // Split by semicolon to run multiple statements if needed, 
        // but pg client often handles multiple statements in one query call 
        // depending on config. Let's try simple query first.
        // Note: client.query(sql) with multiple statements returns an array of results.
        const res = await client.query(sql);

        if (Array.isArray(res)) {
            res.forEach((r, i) => {
                console.log(`--- Result ${i + 1} (${r.command}) ---`);
                if (r.rows.length > 0) console.table(r.rows);
            });
        } else {
            console.log(`--- Result (${res.command}) ---`);
            if (res.rows.length > 0) console.table(res.rows);
        }

        console.log('Done!');
    } catch (err: any) {
        console.error('Execution Failed:', err.message);
        if (err.position) {
            console.error(`Error at position ${err.position}`);
        }
    } finally {
        await client.end();
    }
}

runMigration();
