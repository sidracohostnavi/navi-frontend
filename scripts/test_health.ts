import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testHealth() {
    const connectionId = 'e11cb53d-27de-442c-8055-e716bcb92ac3';

    console.log('Testing health endpoint data fetch...\n');

    // Test connection fetch
    const { data: connection, error: connError } = await supabase
        .from('connections')
        .select('*')
        .eq('id', connectionId)
        .single();

    if (connError) {
        console.error('Connection fetch error:', connError);
    } else {
        console.log('✅ Connection found');
        console.log('  - Email:', connection.display_email);
        console.log('  - Label:', connection.reservation_label);
        console.log('  - Gmail Status:', connection.gmail_status);
    }

    // Test enrichment logs fetch
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: logs, error: logError } = await supabase
        .from('enrichment_logs')
        .select('*')
        .eq('connection_id', connectionId)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false });

    if (logError) {
        console.error('\nEnrichment logs error:', logError);
    } else {
        console.log('\n✅ Enrichment logs:', logs?.length || 0, 'found');
    }

    // Build health response
    const health = {
        gmail_connected: connection?.gmail_status === 'connected',
        label_found: !!connection?.reservation_label,
        label_name: connection?.reservation_label,
        last_scan: logs && logs.length > 0 ? logs[0].created_at : null,
        stats: {
            emails_24h: 0,
            emails_7d: 0,
            bookings_24h: 0,
            bookings_7d: 0
        },
        errors: []
    };

    console.log('\nHealth data:', JSON.stringify(health, null, 2));
}

testHealth();
