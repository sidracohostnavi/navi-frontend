import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testGmailAPI() {
    console.log('Testing Gmail API access with stored tokens...\n');

    // Get the connection with error
    const { data: connection, error } = await supabase
        .from('connections')
        .select('*')
        .eq('id', '8f79f6b7-0f94-4ee5-98bb-933c099a0b4f')
        .single();

    if (error || !connection) {
        console.error('Could not fetch connection:', error);
        return;
    }

    console.log('Connection Details:');
    console.log('- ID:', connection.id);
    console.log('- Email:', connection.display_email);
    console.log('- Gmail Account:', connection.gmail_account_email);
    console.log('- Has Refresh Token:', !!connection.gmail_refresh_token);
    console.log('- Has Access Token:', !!connection.gmail_access_token);
    console.log('- Token Expires:', connection.gmail_token_expires_at ? new Date(connection.gmail_token_expires_at).toISOString() : 'N/A');
    console.log('- Status:', connection.gmail_status);
    console.log('- Last Error:', connection.gmail_last_error_message);
    console.log('\nAttempting to test Gmail API...');

    // Try to use the Google API
    const { google } = await import('googleapis');
    const { getGoogleOAuthClient } = await import('../lib/utils/google.js');

    try {
        const oauth2Client = getGoogleOAuthClient();

        if (connection.gmail_refresh_token) {
            oauth2Client.setCredentials({
                refresh_token: connection.gmail_refresh_token,
                access_token: connection.gmail_access_token
            });

            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            console.log('Calling Gmail API to list labels...');
            const response = await gmail.users.labels.list({ userId: 'me' });

            console.log('\n✅ SUCCESS! Gmail API is working!');
            console.log('Found', response.data.labels?.length || 0, 'labels');
            console.log('\nLabels:', response.data.labels?.map(l => l.name).join(', '));

        } else {
            console.log('❌ No refresh token available');
        }
    } catch (err: any) {
        console.error('\n❌ Gmail API Error:', err.message);
        if (err.message.includes('Gmail API has not been used')) {
            console.error('\n⚠️  ACTION REQUIRED:');
            console.error('   Go to: https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=461057416965');
            console.error('   Click "ENABLE"');
            console.error('   Wait 1-2 minutes, then try "Reconnect" in the UI');
        }
    }
}

testGmailAPI();
