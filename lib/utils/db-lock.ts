import { Client } from 'pg';

/**
 * Executes a PostgreSQL advisory lock function using a direct database connection.
 * We use `pg_try_advisory_lock` which returns true if acquired, false otherwise.
 * Using a direct `pg` Client because Supabase JS `rpc` requires a defined Postgres function
 * and we are prohibited from adding new migrations other than `gmail_sync_log`.
 * 
 * IMPORTANT: This lock holds only for the duration of the db session. Because we use a single function
 * call to acquire, and don't hold the connection open, it would immediately release. 
 * Wait, actually `pg_try_advisory_lock` holds the lock for the session. We MUST keep the client connected
 * to hold the lock while we do our cron work, and then release and disconnect.
 */
export class DBLock {
    private client: Client;
    private key: number;

    constructor() {
        const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
        if (!dbUrl) {
            throw new Error('DATABASE_URL or SUPABASE_DB_URL is required for DBLock');
        }
        // Vercel serverless uses neon/supabase connection strings. 
        // We might need to ensure ssl is used if in prod, but pg will usually handle the direct string if it has sslmeode=require.
        this.client = new Client({
            connectionString: dbUrl,
            ssl: { rejectUnauthorized: false }
        });
        // Use a consistent, application-specific integer key for the cron job lock.
        // E.g., hash of "navi-ical-cron-lock"
        this.key = 28419374;
    }

    async acquire(): Promise<boolean> {
        await this.client.connect();
        const res = await this.client.query('SELECT pg_try_advisory_lock($1) as acquired', [this.key]);
        return res.rows[0].acquired === true;
    }

    async release(): Promise<void> {
        try {
            await this.client.query('SELECT pg_advisory_unlock($1)', [this.key]);
        } catch (e) {
            console.error('[DBLock] Error releasing lock:', e);
        } finally {
            await this.client.end();
        }
    }
}
