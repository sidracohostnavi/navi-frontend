import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Debug logs
console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Found' : 'Missing');
console.log('Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Found' : 'Missing');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('Missing Supabase Env Vars');
    process.exit(1);
}

console.log('Service Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Found' : 'Missing');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkProperties() {
    // 1. Check count
    const { count, error } = await supabase
        .from('cohost_properties')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Error fetching count:', error);
    } else {
        console.log('Total Properties Count:', count);
    }

    // 2. Check first 5 rows
    const { data, error: dataError } = await supabase
        .from('cohost_properties')
        .select('id, name, workspace_id')
        .limit(5);

    if (dataError) {
        console.error('Error fetching data:', dataError);
    } else {
        console.log('Sample Data Found:', data?.length);
        console.log(JSON.stringify(data, null, 2));
    }
    const { data: members, error: memError } = await supabase
        .from('cohost_workspace_members')
        .select('*');

    if (memError) console.error('Members Error:', memError);
    else console.log('Members Found (Service Key):', members?.length);
    console.log(JSON.stringify(members, null, 2));

    const { data: func, error: funcError } = await supabase
        .rpc('get_my_workspace_ids');

    if (funcError) {
        console.error('Function access error (expected if anon):', funcError);
        // Check pg_proc via SQL injection/rpc isn't easy with client.
        // We can use rpc to call specific admin function if I had one.
        // Or just assume it works if no error.
    } else {
        console.log('Function Result (Anon):', func);
    }
}

checkProperties();
