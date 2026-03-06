const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function check() {
    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: bookings } = await service
        .from('bookings')
        .select('*')
        .eq('id', '5fc990b4-3807-4b73-81b4-27e23fe2ff47');
        
    const filteredBookings = bookings || [];

    // --- REPLICATED LOGIC FROM ROUTE.TS ---
    if (filteredBookings.length > 0) {
        const factIdsToFetch = new Set();
        
        for (const booking of filteredBookings) {
          const fromFactId = booking.raw_data?.from_fact_id;
          if (fromFactId) {
            factIdsToFetch.add(fromFactId);
          }
        }

        if (factIdsToFetch.size > 0) {
          const { data: facts } = await service
            .from('reservation_facts')
            .select('id, connection_id, guest_count')
            .in('id', Array.from(factIdsToFetch));

          if (facts && facts.length > 0) {
            const factMap = new Map();
            for (const f of facts) {
              factMap.set(f.id, f);
            }

            for (const booking of filteredBookings) {
              const fromFactId = booking.raw_data?.from_fact_id;
              if (!fromFactId) continue;

              const fact = factMap.get(fromFactId);
              if (fact) {
                booking.matched_connection_id = fact.connection_id;
                if ((booking.guest_count === null || booking.guest_count === 1) && fact.guest_count != null) {
                  booking.guest_count = fact.guest_count;
                }
              }
            }
          }
        }

        const craigTestBooking = filteredBookings.find(b => b.id === '5fc990b4-3807-4b73-81b4-27e23fe2ff47');
        if (craigTestBooking) {
          console.log(`\n[DEBUG-CRAIG] booking_id: ${craigTestBooking.id}`);
          console.log(`[DEBUG-CRAIG] DB guest_name: "${craigTestBooking.guest_name}"`);
          console.log(`[DEBUG-CRAIG] DB raw_data.from_fact_id: ${craigTestBooking.raw_data?.from_fact_id || 'null'}`);
          console.log(`[DEBUG-CRAIG] matched_connection_id: ${craigTestBooking.matched_connection_id || 'null'}\n`);
        }
      }
}
check();
