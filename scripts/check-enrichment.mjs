// Run the actual processMessages pipeline locally and capture full output
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const supabase = createClient('https://axwepnpgkfodkyjtownf.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

// All 4 connections with Gmail
const { data: conns } = await supabase.from('connections')
    .select('id, reservation_label, gmail_refresh_token, gmail_label_name, gmail_label_id')
    .not('gmail_refresh_token', 'is', null);

console.log(`Found ${conns.length} connections with Gmail tokens\n`);

// Test just Spark & Stay (has Sylvia's email)
const sparkConn = conns.find(c => c.reservation_label?.includes('Spark'));
console.log(`Testing: ${sparkConn.reservation_label} (${sparkConn.id.substring(0, 8)})\n`);

// Manually replicate fetchGmailMessages step by step
const { getGoogleOAuthClient } = await import('../../lib/utils/google.js');
const oauth2Client = getGoogleOAuthClient();
oauth2Client.setCredentials({ refresh_token: sparkConn.gmail_refresh_token });
const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// Step 1: Resolve label
const label = sparkConn.reservation_label;
console.log(`Step 1: Resolving label "${label}"...`);
const labelsRes = await gmail.users.labels.list({ userId: 'me' });
const targetLabel = labelsRes.data.labels.find(l => l.name?.toLowerCase() === label.toLowerCase());
console.log(`  Result: ${targetLabel ? targetLabel.name + ' (' + targetLabel.id + ')' : 'NOT FOUND'}\n`);

// Step 2: List ALL message IDs from Gmail
console.log('Step 2: Listing message IDs from Gmail...');
let allMessageIds = [];
let nextPageToken = undefined;
let pageCount = 0;
do {
    const listRes = await gmail.users.messages.list({
        userId: 'me', labelIds: [targetLabel.id], maxResults: 100, pageToken: nextPageToken
    });
    const messages = listRes.data.messages || [];
    allMessageIds.push(...messages.map(m => m.id));
    nextPageToken = listRes.data.nextPageToken;
    pageCount++;
} while (nextPageToken && pageCount < 50);
console.log(`  Total message IDs from Gmail: ${allMessageIds.length}`);

// Check if Sylvia's email ID is in the list
const SYLVIA_ID = '19cbac3b8d5def15';
console.log(`  Sylvia's Gmail ID (${SYLVIA_ID}) in list: ${allMessageIds.includes(SYLVIA_ID)}\n`);

// Step 3: Diff against DB
console.log('Step 3: Diffing against gmail_messages DB...');
const { data: existingRows, error: dbError } = await supabase
    .from('gmail_messages')
    .select('gmail_message_id')
    .eq('connection_id', sparkConn.id);

if (dbError) {
    console.log(`  DB ERROR: ${dbError.message}`);
} else {
    const existingSet = new Set(existingRows?.map(r => r.gmail_message_id) || []);
    const missingIds = allMessageIds.filter(id => !existingSet.has(id));

    console.log(`  Gmail IDs: ${allMessageIds.length}`);
    console.log(`  DB existing: ${existingSet.size}`);
    console.log(`  Missing (new): ${missingIds.length}`);
    console.log(`  Sylvia in existing set: ${existingSet.has(SYLVIA_ID)}`);
    console.log(`  Sylvia in missing: ${missingIds.includes(SYLVIA_ID)}`);

    if (missingIds.length > 0) {
        console.log(`\n  First 5 missing IDs:`);
        for (const id of missingIds.slice(0, 5)) {
            console.log(`    ${id}`);
        }
    }
}
