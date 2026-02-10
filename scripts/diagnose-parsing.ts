
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

async function diagnose() {
    console.log('--- DIAGNOSTIC RUN START ---');

    const { data: connections } = await supabase
        .from('connections')
        .select('id, name')
        .eq('gmail_status', 'connected');

    if (!connections || connections.length === 0) {
        console.log('No active connections.');
        return;
    }

    let totalBefore = 0;
    const { count: countBefore } = await supabase.from('reservation_facts').select('*', { count: 'exact', head: true });
    totalBefore = countBefore || 0;
    console.log(`Reservation Facts Before: ${totalBefore}`);

    for (const conn of connections) {
        console.log(`\nAnalyzing ${conn.name} (${conn.id})...`);

        const { data: messages } = await supabase
            .from('gmail_messages')
            .select('*')
            .eq('connection_id', conn.id);

        if (!messages || messages.length === 0) {
            console.log(`  No stored messages.`);
            continue;
        }

        const inputs = messages.map(m => ({
            id: m.gmail_message_id,
            gmail_message_id: m.gmail_message_id,
            subject: m.subject,
            snippet: m.snippet,
            bodyText: m.raw_metadata?.full_text,
            bodyHtml: m.raw_metadata?.full_html
        }));

        // 1. Process (Parse & create facts)
        // This will log the "Processed Batch: { stats }" JSON
        await EmailProcessor.processMessages(conn.id, inputs, supabase);

        // 2. Enrich (Try to match bookings)
        // This helps diagnose "Parsed but failed booking match"
        const enrichmentStats = await EmailProcessor.enrichBookings(conn.id, supabase);
        console.log(`  Enrichment Stats: Enriched=${enrichmentStats.enriched}, Missing/NoMatch=${enrichmentStats.missing}`);
    }

    console.log('\n--- DIAGNOSTIC RUN COMPLETE ---');
    const { count: countAfter } = await supabase.from('reservation_facts').select('*', { count: 'exact', head: true });
    console.log(`Reservation Facts After: ${countAfter}`);
    console.log(`Facts Added: ${(countAfter || 0) - totalBefore}`);
}

diagnose();
