
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { EmailProcessor } from '@/lib/services/email-processor';

// Load environment variables manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
for (const k in envConfig) process.env[k] = envConfig[k];

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runBackfill() {
    console.log('--- CANONICAL BACKFILL START ---');

    // 1. Get Connections
    const { data: connections } = await supabase
        .from('connections')
        .select('id, name')
        .eq('gmail_status', 'connected'); // Only active ones

    if (!connections || connections.length === 0) {
        console.log('No active connections.');
        return;
    }

    // 2. Process Each
    for (const conn of connections) {
        console.log(`\nProcessing ${conn.name} (${conn.id})...`);

        const { data: messages } = await supabase
            .from('gmail_messages')
            .select('*')
            .eq('connection_id', conn.id);

        if (!messages || messages.length === 0) {
            console.log(`  No stored messages.`);
            continue;
        }

        // Map to Input Format
        const inputs = messages.map(m => ({
            id: m.gmail_message_id, // For log/compatibility
            gmail_message_id: m.gmail_message_id, // CRITICAL: Strict requirement
            subject: m.subject,
            snippet: m.snippet,
            bodyText: m.raw_metadata?.full_text,
            bodyHtml: m.raw_metadata?.full_html
        }));

        console.log(`  Scanning ${inputs.length} messages...`);
        await EmailProcessor.processMessages(conn.id, inputs, supabase);
    }

    console.log('\n--- BACKFILL COMPLETE ---');

    // 3. Final Report
    console.log('\n--- FINAL REPORT ---');
    const { count } = await supabase
        .from('reservation_facts')
        .select('*', { count: 'exact', head: true });

    console.log(`Total Reservation Facts: ${count}`);

    // Sample Facts per platform
    const { data: samples } = await supabase
        .from('reservation_facts')
        .select('guest_name, check_in, listing_name, confidence, source_gmail_message_id')
        .order('created_at', { ascending: false })
        .limit(10);

    console.log('Sample Facts:', JSON.stringify(samples, null, 2));
}

runBackfill();
