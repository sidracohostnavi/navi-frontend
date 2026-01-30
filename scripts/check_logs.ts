import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
    console.log('\n=== enrichment_logs (last 5) ===');
    const { data: eLogs, error: e1 } = await supabase
        .from('enrichment_logs')
        .select('id, connection_id, run_type, status, emails_processed, bookings_updated, details, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    if (e1) console.error('enrichment_logs error:', e1.message);
    else console.log(JSON.stringify(eLogs, null, 2));

    console.log('\n=== ical_sync_log (last 5) ===');
    const { data: iLogs, error: e2 } = await supabase
        .from('ical_sync_log')
        .select('*')
        .order('synced_at', { ascending: false })
        .limit(5);

    if (e2) console.error('ical_sync_log error:', e2.message);
    else console.log(JSON.stringify(iLogs, null, 2));
}

check();
