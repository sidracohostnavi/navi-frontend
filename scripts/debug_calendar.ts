
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or content');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const adminClient = serviceKey ? createClient(supabaseUrl, serviceKey) : null;

async function main() {
    console.log('--- Debugging cohost_workspace_members ---');

    // 1. Try with ANON client on specific column
    console.log('\n[ANON Client] Fetching 1 row (specific column)...');
    const { data: anonData, error: anonError } = await supabase
        .from('cohost_workspace_members')
        .select('can_view_calendar')
        .limit(1);

    if (anonError) {
        console.error('Anon Error:', anonError.message);
        console.error('Anon Error details:', anonError);
    } else if (anonData && anonData.length > 0) {
        console.log('Anon Keys found:', Object.keys(anonData[0]));
    } else {
        // RLS might return empty, but if schema is wrong, .select() usually errors or warns
        console.log('No data found for Anon (RLS active, but column accepted)');
    }

    // 2. Query Information Schema via Service Client to verify permissions/existence
    if (adminClient) {
        console.log('\n[SERVICE Client] Checking Schema...');
        const { data: cols, error: schemaError } = await adminClient
            .from('information_schema.columns') // Only works if expose_schema is set, usually not. 
            // But we can try querying the table directly again
            .select('*')
            .limit(1);

        // Standard fetch to confirm keys again
        const { data: adminData } = await adminClient
            .from('cohost_workspace_members')
            .select('*')
            .limit(1);
        if (adminData) console.log('Service Keys:', Object.keys(adminData[0]));
    }
}

main();
