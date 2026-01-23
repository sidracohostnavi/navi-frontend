const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://axwepnpgkfodkyjtownf.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4d2VwbnBna2ZvZGt5anRvd25mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDk1MTYyMSwiZXhwIjoyMDgwNTI3NjIxfQ.Qw2WDeEHQyxe5ob7Z9xLDNky1Hwu1Y1LcJ763XrV6_0';

const supabase = createClient(supabaseUrl, serviceRoleKey);
const PROPERTY_ID = '99c9875e-07c1-4e5d-bc01-3a5b9c1b0937';

async function checkDatesDeep() {
    console.log('=== DEEP CHECK OF BOOKING DATES ===\n');

    // Fetch ANY bookings for property
    const { data: bookings, error } = await supabase
        .from('bookings')
        .select('guest_name, check_in, check_out, source_type, is_active, raw_data, last_synced_at')
        .eq('property_id', PROPERTY_ID)
        .order('created_at', { ascending: false })
        .limit(3);

    if (error) {
        console.error(error);
        return;
    }

    if (bookings.length === 0) {
        console.log("❌ No bookings found at all for this property. Did sync run?");
    } else {
        bookings.forEach(b => {
            console.log(`\nGuest: ${b.guest_name} (${b.source_type})`);
            console.log(`  Active: ${b.is_active}`);
            console.log(`  Synced: ${b.last_synced_at}`);
            console.log(`  Check-in:  ${b.check_in}`);
            console.log(`  Check-out: ${b.check_out}`);
            if (b.raw_data && b.raw_data.start) {
                console.log(`  Raw Start: ${JSON.stringify(b.raw_data.start)}`);
                console.log(`  Raw DateOnly: ${b.raw_data.dateOnly}`);
                console.log(`  Raw Datetype: ${b.raw_data.datetype}`);
            }
        });
    }
}

checkDatesDeep();
