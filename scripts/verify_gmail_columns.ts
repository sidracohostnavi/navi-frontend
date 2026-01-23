
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Checking "connections" table columns...');

    // We can't query information_schema easily via JS client usually (unless exposed), 
    // but we can try to select the columns from a single row or use an RPC if available.
    // Or just try to insert/update a dummy row? No, that's risky.
    // Safest: Introspection via empty select.

    const { data, error } = await supabase
        .from('connections')
        .select('gmail_access_token, gmail_refresh_token, gmail_scopes, gmail_connected_at, gmail_status')
        .limit(1);

    if (error) {
        console.error('❌ Error selecting columns:', error.message);
        if (error.message.includes('does not exist')) {
            console.error('   -> Confirmed missing columns.');
        }
    } else {
        console.log('✅ Columns selection successful!');
        console.log('   (This confirms the columns exist in the schema)');
    }
}

checkSchema();
