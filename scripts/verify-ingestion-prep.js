
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
for (const k in envConfig) {
    process.env[k] = envConfig[k];
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runVerification() {
    console.log('--- Gmail Ingestion Verification ---');

    // 1. Find a connection with Gmail Setup
    const { data: connections } = await supabase
        .from('connections')
        .select('id, name, reservation_label, gmail_status')
        .eq('gmail_status', 'connected')
        .limit(1);

    if (!connections || connections.length === 0) {
        console.log('No connected Gmail accounts found.');
        return;
    }

    const conn = connections[0];
    console.log(`Testing Connection: ${conn.name} (${conn.id})`);
    console.log(`Label: ${conn.reservation_label}`);

    // 2. Count Initial Messages
    const { count: initialCount } = await supabase
        .from('gmail_messages')
        .select('*', { count: 'exact', head: true })
        .eq('connection_id', conn.id);

    console.log(`Initial gmail_messages count: ${initialCount}`);

    // 3. Trigger Sync (Simulate API Call)
    // We'll call the sync endpoint via fetch
    console.log('Triggering Sync via API...');

    // Note: We need a valid session cookie for the API, OR we can hack it by calling the service function directly?
    // We can't easily call the API route from node script without auth mock.
    // Instead, let's call the SERVICE directly (EmailProcessor) - but that requires typescript compilation.

    // Alternative: Just run curl against localhost:3000 if dev server is running?
    // Yes, dev server is running. But we need Auth. 
    // Let's just output the curl command for the user or try to invoke it if we have a SERVICE KEY bypass?
    // The API uses `supabase.auth.getUser()`, so service key won't work easily unless we mock it.

    // WAIT: We can use the codebase to run a script that imports EmailProcessor directly using ts-node?
    // Or just rely on the user to click "Sync"?

    // Let's rely on `ts-node` or `npx` to run a script that imports the service?
    // Complicated with Next.js aliases.

    // SIMPLEST PATH: Just verify the DB state *assuming* I can trigger it.
    // Actually, I can use `run_command` to execute a script that uses `ts-node` and imports `EmailProcessor`.
    // I need to handle `@/` aliases.

    console.log('Skipping API call in this script. Please run the sync manually or via curl.');
    console.log(`Target Connection ID: ${conn.id}`);
}

runVerification();
