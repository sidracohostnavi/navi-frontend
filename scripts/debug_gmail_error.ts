
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

async function checkErrors() {
    console.log('Fetching connections with errors...');

    const { data: connections, error } = await supabase
        .from('connections')
        .select(`
            id, 
            gmail_account_email, 
            gmail_status, 
            gmail_last_error_code, 
            gmail_last_error_message, 
            gmail_last_verified_at,
            reservation_label,
            gmail_refresh_token
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('DB Error:', error);
        return;
    }

    if (!connections || connections.length === 0) {
        console.log('No connections found.');
        return;
    }

    connections.forEach(c => {
        console.log('------------------------------------------------');
        console.log(`Connection: ${c.gmail_account_email || 'Unknown'} (${c.id})`);
        console.log(`Status: ${c.gmail_status}`);
        if (c.gmail_status === 'error') {
            console.log(`❌ Error Code: ${c.gmail_last_error_code}`);
            console.log(`❌ Message: ${c.gmail_last_error_message}`);
        }
        console.log(`Label Configured: ${c.reservation_label || 'Airbnb (default)'}`);
        console.log(`Refresh Token Present: ${c.gmail_refresh_token ? 'YES' : 'NO'}`);
        console.log(`Last Verified: ${c.gmail_last_verified_at}`);
    });
}

checkErrors();
