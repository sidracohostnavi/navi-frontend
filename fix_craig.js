const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function run() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Locate all Craig Hampel bookings
    const { data: bookings, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('guest_name', 'Craig Hampel')
        .eq('is_active', true);

    if (error) {
        console.error("Error fetching bookings", error);
        return;
    }

    // We know Farmhouse is '3596be29-8b42-456f-9fb1-85625a34c946'
    // The other one should be Green Cottage
    const farmhouseBooking = bookings.find(b => b.property_id === '3596be29-8b42-456f-9fb1-85625a34c946');
    const greenCottageBooking = bookings.find(b => b.property_id !== '3596be29-8b42-456f-9fb1-85625a34c946');

    if (!greenCottageBooking) {
        console.log("No Green Cottage 'Craig Hampel' booking found!");
        return;
    }

    console.log("=== STEP 1: BEFORE SNAPSHOT (Green Cottage Booking) ===");
    console.log(JSON.stringify(greenCottageBooking, null, 2));

    console.log("\n=== STEP 2: CONFIRM ENRICHMENT METADATA ===");
    const rawData = greenCottageBooking.raw_data || {};
    console.log("from_fact_id exists:", !!rawData.from_fact_id);
    console.log("enriched_manually exists:", !!rawData.enriched_manually);
    if (farmhouseBooking) {
        console.log("Valid Farmhouse fact linkage matched?:", rawData.from_fact_id === farmhouseBooking.raw_data?.from_fact_id);
    }

    if (rawData.from_fact_id && farmhouseBooking && rawData.from_fact_id === farmhouseBooking.raw_data?.from_fact_id) {
        console.log("-> This is a false enrichment (duplicate ID stamp). Proceeding to reset.");
    } else {
        console.log("-> Does not overtly share ID with Farmhouse, but still resetting per instructions.");
    }

    // 3. Reset ONLY the Incorrect Booking
    const newRawData = { ...rawData };
    delete newRawData.enriched_manually;
    delete newRawData.from_fact_id;
    delete newRawData.enrichment_reason;
    delete newRawData.enriched_from_fact;

    const summary = newRawData.summary || 'Reserved';

    const { error: updateError, data: updatedData } = await supabase
        .from('bookings')
        .update({
            guest_name: summary,
            guest_first_name: null,
            guest_last_initial: null,
            guest_count: 1,
            raw_data: newRawData
        })
        .eq('id', greenCottageBooking.id)
        .select();

    if (updateError) {
        console.error("Error resetting booking:", updateError);
        return;
    }

    console.log("\n=== STEP 3: AFTER SNAPSHOT (Green Cottage Booking) ===");
    console.log(JSON.stringify(updatedData[0], null, 2));

    // 4. Confirm Farmhouse Booking
    console.log("\n=== STEP 4: CONFIRM FARMHOUSE BOOKING UNTOUCHED ===");
    const { data: fhVerify } = await supabase
        .from('bookings')
        .select('id, guest_name')
        .eq('id', farmhouseBooking.id)
        .single();

    console.log(JSON.stringify(fhVerify, null, 2));

}
run();
