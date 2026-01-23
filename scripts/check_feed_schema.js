const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://axwepnpgkfodkyjtownf.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4d2VwbnBna2ZvZGt5anRvd25mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDk1MTYyMSwiZXhwIjoyMDgwNTI3NjIxfQ.Qw2WDeEHQyxe5ob7Z9xLDNky1Hwu1Y1LcJ763XrV6_0';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkSchema() {
    console.log('=== CHECKING ICAL_FEEDS SCHEMA ===');
    const { data, error } = await supabase
        .from('ical_feeds')
        .select('*')
        .limit(1);

    if (error) {
        console.error(error);
    } else {
        if (data.length > 0) {
            console.log('Columns:', Object.keys(data[0]));
        } else {
            console.log('Table exists but empty. Cannot infer columns easily via select *.');
            // Try an insert to fail to get column error or just assume
        }
    }
}

checkSchema();
