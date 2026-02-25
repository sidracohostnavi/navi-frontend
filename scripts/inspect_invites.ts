
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceKey);

async function inspect() {
    console.log('--- Inspecting cohost_workspace_invites keys ---');

    // Try to fetch a row to see keys
    const { data, error } = await admin
        .from('cohost_workspace_invites')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Select Error:', error.message);
    } else if (data && data.length > 0) {
        console.log('Row Keys:', Object.keys(data[0]));
    } else {
        console.log('Table exists but is empty. Cannot infer keys from data.');
        // Try inserting a dummy to fail on column name? No, risky.
    }
}

inspect();
