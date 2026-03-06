const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://axwepnpgkfodkyjtownf.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findEnrichedButMasked() {
    // 1. Fetch all bookings that are enriched (either flag is true)
    // We only care about active bookings.
    const { data: bookings, error: bookingError } = await supabase
        .from('bookings')
        .select(`
            id, 
            property_id, 
            guest_name, 
            check_in, 
            check_out, 
            raw_data,
            cohost_properties (name)
        `)
        .eq('is_active', true)
        .or('raw_data->>enriched_from_fact.eq.true,raw_data->>enriched_manually.eq.true');

    if (bookingError) {
        console.error("Error fetching bookings:", bookingError);
        return;
    }

    // 2. Filter for bookings where the current name is masked
    const maskedNames = ['guest', 'reserved', 'blocked', 'not available', 'closed period'];

    function isMasked(name) {
        if (!name) return true;
        const lower = name.toLowerCase();
        if (maskedNames.includes(lower)) return true;
        if (/(airbnb|vrbo|lodgify|booking\.com|via |expedia)/i.test(name)) return true;
        if (/^[a-z0-9_-]{6,20}$/i.test(name) && /\d/.test(name)) return true;
        if ((name.match(/\*/g) || []).length >= 5) return true;
        return false;
    }

    let affectedBookings = bookings.filter(b => isMasked(b.guest_name));

    // 3. For each affected booking, try to find the actual name from the linked reservation_fact
    const results = [];
    for (const b of affectedBookings) {
        const factId = b.raw_data?.from_fact_id;
        let trueName = "Unknown (No Fact ID)";

        if (factId) {
            const { data: fact } = await supabase
                .from('reservation_facts')
                .select('guest_name, check_in, check_out')
                .eq('id', factId)
                .single();

            if (fact && fact.guest_name) {
                trueName = fact.guest_name;
            } else if (fact) {
                trueName = "Unknown (Fact has null name)";
            }
        }

        results.push({
            bookingId: b.id,
            property: b.cohost_properties?.name || 'Unknown Property',
            dates: `${b.check_in.split('T')[0]} to ${b.check_out.split('T')[0]}`,
            currentMaskedName: b.guest_name,
            trueNameFromFact: trueName,
            enrichedFlags: {
                from_fact: !!b.raw_data?.enriched_from_fact,
                manually: !!b.raw_data?.enriched_manually
            }
        });
    }

    console.log(`Found ${results.length} enriched bookings with masked names.`);
    console.table(results);
}

findEnrichedButMasked();
