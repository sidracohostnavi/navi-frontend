
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log('--- BOOKINGS ---');
    const { data: bookings, error: bError } = await supabase.from('bookings').select('*').limit(1);
    if (bError) console.error(bError);
    else console.log(Object.keys(bookings[0] || {}));

    console.log('\n--- ICAL_FEEDS ---');
    const { data: feeds, error: fError } = await supabase.from('ical_feeds').select('*').limit(1);
    if (fError) console.error(fError);
    else console.log(Object.keys(feeds[0] || {}));

    console.log('\n--- CONNECTIONS ---');
    const { data: conns, error: cError } = await supabase.from('connections').select('*').limit(1);
    if (cError) console.error(cError);
    else console.log(Object.keys(conns[0] || {}));
}

inspect();
