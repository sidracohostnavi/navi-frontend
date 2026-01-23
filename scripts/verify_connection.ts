import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyAndFix() {
    console.log('=== Gmail Connection Fix & Verification ===\n');

    // Get the error connection
    const { data: connections } = await supabase
        .from('connections')
        .select('*')
        .eq('gmail_status', 'error')
        .order('created_at', { ascending: false })
        .limit(1);

    if (!connections || connections.length === 0) {
        console.log('No error connections found');
        return;
    }

    const conn = connections[0];
    console.log('Connection ID:', conn.id);
    console.log('Email:', conn.display_email);
    console.log('Current Label:', conn.reservation_label || 'NULL');
    console.log('Has Refresh Token:', !!conn.gmail_refresh_token);
    console.log('Has Access Token:', !!conn.gmail_access_token);
    console.log('\n--- Starting Verification ---\n');

    try {
        // Setup OAuth client
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/cohost/connections/gmail/callback`
        );

        oauth2Client.setCredentials({
            refresh_token: conn.gmail_refresh_token,
            access_token: conn.gmail_access_token
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // List labels
        console.log('Fetching Gmail labels...');
        const labelsRes = await gmail.users.labels.list({ userId: 'me' });
        const labels = labelsRes.data.labels || [];

        console.log(`Found ${labels.length} labels`);
        console.log('Available labels:', labels.map(l => l.name).join(', '));

        // Check for the configured label
        const targetLabel = conn.reservation_label || 'Airbnb';
        const foundLabel = labels.find(l => l.name?.toLowerCase() === targetLabel.toLowerCase());

        console.log(`\nLooking for label: "${targetLabel}"`);

        if (foundLabel) {
            console.log(`✅ Label found: ${foundLabel.name}`);

            // Update status to connected
            const { error: updateError } = await supabase
                .from('connections')
                .update({
                    gmail_status: 'connected',
                    gmail_last_error_code: null,
                    gmail_last_error_message: null,
                    gmail_last_verified_at: new Date().toISOString()
                })
                .eq('id', conn.id);

            if (updateError) {
                console.error('Failed to update status:', updateError);
            } else {
                console.log('\n✅ SUCCESS! Connection status updated to CONNECTED');
                console.log('\nRefresh the page - your connection should now show as Connected!');
            }
        } else {
            console.log(`❌ Label "${targetLabel}" not found`);
            console.log('\nAvailable labels that might match:');
            labels
                .filter(l => l.name?.toLowerCase().includes('airbnb') || l.name?.toLowerCase().includes('lodgify'))
                .forEach(l => console.log(`  - ${l.name}`));

            console.log('\nTo fix: Update the label in the database to one of the above');
        }

    } catch (err: any) {
        console.error('\n❌ Verification failed:', err.message);

        // Update with error
        await supabase
            .from('connections')
            .update({
                gmail_status: 'error',
                gmail_last_error_code: 'VERIFICATION_FAILED',
                gmail_last_error_message: err.message,
                gmail_last_verified_at: new Date().toISOString()
            })
            .eq('id', conn.id);
    }
}

verifyAndFix();
