
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function debugGmail() {
    console.log('--- Starting Gmail Debug ---');

    // 1. Setup Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // Or Service Role if RLS prevents
    // Actually we need service role to read connections securely usually, but let's try anon first if RLS allows or use service key if available
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceKey) {
        console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Get any connection
    const { data: connections, error } = await supabase
        .from('connections')
        .select('*')
        .limit(5);

    if (error || !connections || connections.length === 0) {
        console.error('No connections found or DB error:', error);
        return;
    }

    const connection = connections[0];
    console.log(`Testing Connection ID: ${connection.id}`);
    console.log(`Label Name in DB: "${connection.reservation_label}"`);

    if (!connection.gmail_refresh_token) {
        console.error('No refresh token.');
        return;
    }

    // 3. Setup Gmail
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: connection.gmail_refresh_token });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // 4. List Labels
    console.log('\n--- Listing Labels ---');
    const labelsRes = await gmail.users.labels.list({ userId: 'me' });
    const labels = labelsRes.data.labels || [];

    const targetName = connection.reservation_label || 'Airbnb';
    const targetLabel = labels.find(l => l.name?.toLowerCase() === targetName.toLowerCase());

    if (targetLabel) {
        console.log(`✅ Found Label: "${targetLabel.name}" (ID: ${targetLabel.id})`);
        console.log(`   Messages Total: ${targetLabel.messagesTotal}`);
        console.log(`   Threads Total: ${targetLabel.threadsTotal}`);
        console.log(`   Type: ${targetLabel.type}`);
    } else {
        console.error(`❌ Label "${targetName}" not found in Gmail list.`);
        console.log('Available labels:', labels.map(l => l.name).join(', '));
    }

    if (!targetLabel) return;

    // 5. Test Query by Name
    const qName = `label:${targetName}`;
    console.log(`\n--- Test 1: Query by Name [${qName}] ---`);
    const resName = await gmail.users.messages.list({
        userId: 'me',
        q: qName,
        maxResults: 5
    });
    console.log(`Result Count: ${resName.data.resultSizeEstimate}`);
    console.log(`Messages: ${resName.data.messages?.length || 0}`);

    // 6. Test Query by Name Quoted
    const qNameQuoted = `label:"${targetName}"`;
    console.log(`\n--- Test 2: Query by Name Quoted [${qNameQuoted}] ---`);
    const resNameQuoted = await gmail.users.messages.list({
        userId: 'me',
        q: qNameQuoted,
        maxResults: 5
    });
    console.log(`Result Count: ${resNameQuoted.data.resultSizeEstimate}`);
    console.log(`Messages: ${resNameQuoted.data.messages?.length || 0}`);

    // 7. Test Query by ID
    console.log(`\n--- Test 3: Query by Label ID in parameter (NO 'q') ---`);
    const resId = await gmail.users.messages.list({
        userId: 'me',
        labelIds: [targetLabel.id!],
        maxResults: 5
    });
    console.log(`Result Count: ${resId.data.resultSizeEstimate}`);
    console.log(`Messages: ${resId.data.messages?.length || 0}`);
}

debugGmail().catch(console.error);
