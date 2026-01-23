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

async function fixConnection() {
    console.log('Fetching connection with error...\n');

    const { data: connections, error } = await supabase
        .from('connections')
        .select('*')
        .eq('gmail_status', 'error')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error || !connections || connections.length === 0) {
        console.error('No error connections found');
        return;
    }

    const conn = connections[0];
    console.log('Connection ID:', conn.id);
    console.log('Current Label:', conn.reservation_label || 'NULL');
    console.log('Error:', conn.gmail_last_error_message);
    console.log('\nUpdating label to "Airbnb Guests"...\n');

    // Update the label
    const { error: updateError } = await supabase
        .from('connections')
        .update({ reservation_label: 'Airbnb Guests' })
        .eq('id', conn.id);

    if (updateError) {
        console.error('Update failed:', updateError);
        return;
    }

    console.log('✅ Label updated successfully!');
    console.log('\nNow triggering verification via API...\n');

    // Call the verification endpoint
    try {
        const response = await fetch(`http://localhost:3000/api/cohost/connections/${conn.id}/gmail/labels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label_name: 'Airbnb Guests' })
        });

        const data = await response.json();
        console.log('Verification result:', JSON.stringify(data, null, 2));

        if (data.success) {
            console.log('\n✅ SUCCESS! Connection should now show as Connected');
        } else {
            console.log('\n❌ Verification failed:', data.error);
        }
    } catch (err: any) {
        console.error('API call failed:', err.message);
        console.log('\nTrying direct verification...');

        // Import and call GmailService directly
        const { GmailService } = await import('../lib/services/gmail-service.js');
        const result = await GmailService.verifyConnection(conn.id);
        console.log('Direct verification result:', result);
    }
}

fixConnection();
