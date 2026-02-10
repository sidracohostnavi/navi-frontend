
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { EmailProcessor } from '@/lib/services/email-processor';

// Load environment variables manually
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

async function runDataSync() {
    const { data: connections } = await supabase
        .from('connections')
        .select('id, name, reservation_label, gmail_status')
        .eq('gmail_status', 'connected');

    if (!connections || connections.length === 0) {
        console.log('No connected accounts found.');
        return;
    }

    for (const conn of connections) {
        console.log(`\n\n--- Syncing ${conn.name} (${conn.reservation_label}) ---`);
        try {
            const results = await EmailProcessor.processMessages(conn.id, [], supabase);
            console.log(`Sync Results: Processed ${results.length} reservation facts.`);

            const { count } = await supabase
                .from('gmail_messages')
                .select('*', { count: 'exact', head: true })
                .eq('connection_id', conn.id);

            console.log(`Final Database Count for ${conn.name}: ${count}`);
        } catch (err) {
            console.error(`Failed to sync ${conn.name}:`, err);
        }
    }
}

runDataSync();
