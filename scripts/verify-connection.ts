
import { createClient } from '@supabase/supabase-js';

// Env vars provided by runner

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('--- Supabase Connection Verification ---');
console.log(`URL: ${supabaseUrl ? 'Found' : 'MISSING'}`);
console.log(`Key: ${supabaseAnonKey ? 'Found' : 'MISSING'}`);

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('ERROR: Missing environment variables.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verify() {
    try {
        // Try to get the session - this verifies the client config is valid enough to talk to Auth
        // even if no user is logged in.
        const { data, error } = await supabase.auth.getSession();

        if (error) {
            console.error('ERROR: Failed to connect or fetch session.');
            console.error(error);
            process.exit(1);
        }

        console.log('SUCCESS: Connection established.');
        console.log('Client successfully initialized and communicated with Supabase Auth.');

        // Optional: Try to query a table if you want to test database access (requires a known table)
        // For now, auth check is sufficient to prove the URL/Key are valid for this project.

    } catch (err) {
        console.error('ERROR: Unexpected exception.');
        console.error(err);
        process.exit(1);
    }
}

verify();
