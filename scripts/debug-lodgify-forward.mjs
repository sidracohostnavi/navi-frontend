import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runQueries() {
    console.log('=== Query 1: Was the email saved to gmail_messages? ===');
    const { data: q1, error: err1 } = await supabase
        .from('gmail_messages')
        .select('id, subject, created_at, processed_at, connection_id')
        .or('subject.ilike.%B19038248%,subject.ilike.%shivam%,subject.ilike.%fwd%lodgify%')
        .order('created_at', { ascending: false })
        .limit(5);
    if (err1) console.error(err1);
    else console.table(q1);

    console.log('\\n=== Query 2: Was a fact created in reservation_facts? ===');
    const { data: q2, error: err2 } = await supabase
        .from('reservation_facts')
        .select('*')
        .or('confirmation_code.eq.B19038248,guest_name.ilike.%shivam%')
        .order('created_at', { ascending: false });
    if (err2) console.error(err2);
    else {
        if (!q2 || q2.length === 0) console.log("No facts found.");
        else console.table(q2);
    }

    console.log('\\n=== Query 3: Does the booking exist with the correct Lodgify code? ===');
    // Substring extraction is tricky in standard Supabase JS select, we will fetch and manually extract for output
    const { data: q3, error: err3 } = await supabase
        .from('bookings')
        .select('id, guest_name, enriched_guest_name, check_in, check_out, raw_data')
        .eq('check_in', '2026-03-22')
        .eq('check_out', '2026-03-25');
    if (err3) console.error(err3);
    else {
        const mapped = q3.map(b => {
            const desc = b.raw_data?.description || '';
            const match = desc.match(/B\d+/);
            return {
                id: b.id,
                guest_name: b.guest_name,
                enriched_guest_name: b.enriched_guest_name,
                check_in: b.check_in,
                check_out: b.check_out,
                lodgify_code: match ? match[0] : null
            };
        });
        console.table(mapped);
    }

    console.log('\\n=== Query 5: Recent gmail_messages for Lodgify connection ===');
    // First get the lodgify connection ID
    const { data: conn, error: connErr } = await supabase
        .from('connections')
        .select('id')
        .ilike('name', '%lodgify%')
        .limit(1)
        .single();

    if (connErr) {
        console.error("Failed to find Lodgify connection", connErr);
    } else if (conn) {
        const { data: q5, error: err5 } = await supabase
            .from('gmail_messages')
            .select('subject, created_at, processed_at')
            .eq('connection_id', conn.id)
            .order('created_at', { ascending: false })
            .limit(10);
        if (err5) console.error(err5);
        else console.table(q5);
    }
}

runQueries();
