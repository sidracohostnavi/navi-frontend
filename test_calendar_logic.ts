require('dotenv').config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const propId = '3596be29-8b42-456f-9fb1-85625a34c946';

  const { data: bData } = await supabase
    .from('bookings')
    .select('*')
    .eq('property_id', propId)
    .eq('is_active', true)
    .gte('check_in', '2026-03-09')
    .lte('check_in', '2026-03-21')
    .order('check_in');

  let filteredBookings = bData || [];
  
  console.log("BEFORE COUNT:", filteredBookings.length);
  filteredBookings.forEach(b => console.log(`  - ${b.id.split('-')[0]} | ${b.check_in.split('T')[0]} to ${b.check_out.split('T')[0]} | ${b.guest_name}`));

  const { data: propPolicy } = await supabase
    .from('cohost_properties')
    .select('id, cleaning_pre_days, cleaning_post_days')
    .eq('id', propId)
    .single();

  const policyMap = new Map();
  if (propPolicy) policyMap.set(propId, propPolicy);

  const isHold = (b: any) => {
    if (!!b.matched_connection_id || !!b.manual_connection_id || !!b.manually_resolved_at) return false;
    if (!b.guest_name) return true;
    const gn = b.guest_name.toLowerCase();
    const keywords = ['cleaning', 'maintenance', 'hold', 'blocked', 'unavailable', 'reservation', 'reserved'];
    if (keywords.some(k => gn.includes(k))) return true;
    return ['guest', 'not available', 'closed period', 'airbnb (not available)'].includes(gn);
  };

  const addDaysToIso = (iso: string, days: number) => {
    const dateStr = iso.split('T')[0];
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
  };

  // --- NEW LOGIC ---
  const finalPreCleaningBookings: any[] = [];
  const bookingsByPropBuffer = new Map<string, any[]>();
  for (const b of filteredBookings) {
    if (!bookingsByPropBuffer.has(b.property_id)) bookingsByPropBuffer.set(b.property_id, []);
    bookingsByPropBuffer.get(b.property_id)!.push(b);
  }

  const isoDate = (d: any) => new Date(d).toISOString().slice(0, 10);

  for (const [pId, propBookings] of bookingsByPropBuffer.entries()) {
    const policy = policyMap.get(pId);
    if (!policy || (policy.cleaning_pre_days === 0 && policy.cleaning_post_days === 0)) {
      finalPreCleaningBookings.push(...propBookings);
      continue;
    }

    const preDays = policy.cleaning_pre_days || 0;
    const postDays = policy.cleaning_post_days || 0;

    const realBookings = propBookings.filter((b: any) => {
      const isEnriched = !!(b.raw_data && b.raw_data.enriched_from_fact);
      const isManual = !!b.manual_connection_id || !!b.manually_resolved_at;
      return isEnriched || isManual || !isHold(b);
    });

    for (const b of propBookings) {
      if (b.platform === 'Lodgify ') { // Note the trailing space from DB!
        const isEnriched = !!(b.raw_data && b.raw_data.enriched_from_fact);
        if (isEnriched) {
          finalPreCleaningBookings.push(b);
          continue;
        }

        const bIn = isoDate(b.check_in);
        const bOut = isoDate(b.check_out);

        const isBuffer = realBookings.some((real: any) => {
          if (real.id === b.id) return false;

          const rIn = isoDate(real.check_in);
          const rOut = isoDate(real.check_out);

          if (preDays > 0) {
            const expectedPreIn = addDaysToIso(rIn, -preDays);
            if (bIn === expectedPreIn && bOut === rIn) return true;
          }

          if (postDays > 0) {
            const expectedPostOut = addDaysToIso(rOut, postDays);
            if (bIn === rOut && bOut === expectedPostOut) return true;
          }

          return false;
        });

        if (isBuffer) {
          continue; 
        }
      }
      finalPreCleaningBookings.push(b);
    }
  }

  console.log("\nAFTER LOGIC COUNT:", finalPreCleaningBookings.length);
  finalPreCleaningBookings.forEach(b => console.log(`  - ${b.id.split('-')[0]} | ${b.check_in.split('T')[0]} to ${b.check_out.split('T')[0]} | ${b.guest_name}`));
}

run();
