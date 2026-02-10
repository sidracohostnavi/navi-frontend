
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

async function verifyUpsert() {
    console.log('--- Verification: Testing UPSERT Logic ---');

    const lodgifyId = '2a99855a-bfd1-4eee-bb04-2673e714d7d7';

    // 1. Fetch Existing Messages from DB
    const { data: messages } = await supabase
        .from('gmail_messages')
        .select('*')
        .eq('connection_id', lodgifyId);

    if (!messages || messages.length === 0) {
        console.log('No messages found to re-process.');
        return;
    }

    console.log(`Fetched ${messages.length} existing messages from DB.`);

    // 2. Map to expected input format for processMessages
    // processMessages expects: { id, subject, snippet, bodyText, bodyHtml }
    // Our DB rows have: gmail_message_id, subject, snippet, raw_metadata { full_text, full_html }

    const mappedMessages = messages.map(m => ({
        id: m.gmail_message_id, // Important: This maps to 'id' expected by flow
        gmail_message_id: m.gmail_message_id, // Also pass this for the new check
        subject: m.subject,
        snippet: m.snippet,
        bodyText: m.raw_metadata?.full_text,
        bodyHtml: m.raw_metadata?.full_html
    }));

    // 3. Run Process Messages (Re-Scan)
    console.log('Running processMessages with existing data...');
    const results = await EmailProcessor.processMessages(lodgifyId, mappedMessages, supabase);

    console.log(`\nRe-scan Result: Processed/Upserted ${results.length} facts.`);

    // 4. Check DB Count (Should allow us to confirm no duplicates if we run it twice)
    const { count } = await supabase
        .from('reservation_facts')
        .select('*', { count: 'exact', head: true })
        .eq('connection_id', lodgifyId);

    console.log(`Final Fact Count: ${count}`);
}

verifyUpsert();
