const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://axwepnpgkfodkyjtownf.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4d2VwbnBna2ZvZGt5anRvd25mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDk1MTYyMSwiZXhwIjoyMDgwNTI3NjIxfQ.Qw2WDeEHQyxe5ob7Z9xLDNky1Hwu1Y1LcJ763XrV6_0';

const supabase = createClient(supabaseUrl, serviceRoleKey);
const PROPERTY_ID = '99c9875e-07c1-4e5d-bc01-3a5b9c1b0937';

async function checkDates() {
    console.log('=== CHECKING BOOKING DATES ===\n');

    // Fetch a few bookings
    const { data: bookings, error } = await supabase
        .from('bookings')
        .select('guest_name, check_in, check_out, source_type')
        .eq('property_id', PROPERTY_ID)
        .eq('is_active', true)
        .limit(5);

    if (error) {
        console.error(error);
        return;
    }

    bookings.forEach(b => {
        console.log(`Guest: ${b.guest_name} (${b.source_type})`);
        console.log(`  Check-in:  ${b.check_in}`);
        console.log(`  Check-out: ${b.check_out}`);
    });
}

checkDates();
