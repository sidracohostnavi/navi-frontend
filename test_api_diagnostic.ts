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

  // ─── EXACT CODE FROM ROUTE.TS ───
  const finalPreCleaningBookings: any[] = [];
  
  const bookingsByPropBuffer = new Map<string, any[]>();
  for (const b of filteredBookings) {
    if (!bookingsByPropBuffer.has(b.property_id)) bookingsByPropBuffer.set(b.property_id, []);
    bookingsByPropBuffer.get(b.property_id)!.push(b);
  }

  const isoDate = (d: any) => new Date(d).toISOString().slice(0, 10);

  for (const [propId, propBookings] of bookingsByPropBuffer.entries()) {
    const policy = policyMap.get(propId);
    
    // START DIAGNOSTIC
    const isFarmhouse = propId === '3596be29-8b42-456f-9fb1-85625a34c946';
    if (isFarmhouse) {
      console.log(`\n--- DIAGNOSTIC: Farmhouse ---`);
      console.log(`policyMap.get(propId):`, policy);
      console.log(`preDays: ${policy?.cleaning_pre_days}, postDays: ${policy?.cleaning_post_days}`);
      console.log(`Count of propBookings before suppression:`, propBookings.length);
    }
    // END DIAGNOSTIC

    if (!policy || (policy.cleaning_pre_days === 0 && policy.cleaning_post_days === 0)) {
      finalPreCleaningBookings.push(...propBookings);
      continue;
    }

    const preDays = policy.cleaning_pre_days || 0;
    const postDays = policy.cleaning_post_days || 0;

    const realBookings = propBookings.filter(b => {
      const isEnriched = !!(b.raw_data && b.raw_data.enriched_from_fact);
      const isManual = !!b.manual_connection_id || !!b.manually_resolved_at;
      return isEnriched || isManual || !isHold(b);
    });

    let suppressedCount = 0;

    for (const b of propBookings) {
      if (b.platform?.trim() === 'Lodgify') {
        const isEnriched = !!(b.raw_data && b.raw_data.enriched_from_fact);
        if (isEnriched) {
          finalPreCleaningBookings.push(b);
          continue;
        }

        const bIn = isoDate(b.check_in);
        const bOut = isoDate(b.check_out);

        const isBuffer = realBookings.some(real => {
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

        if (isFarmhouse) {
          console.log(`Lodgify booking ${b.id}: check_in=${bIn}, check_out=${bOut}, isBuffer=${isBuffer}`);
        }

        if (isBuffer) {
          suppressedCount++;
          continue;
        }
      } else {
        if (isFarmhouse) {
          console.log(`Non-Lodgify booking ${b.id}: platform='${b.platform}'`);
        }
      }

      finalPreCleaningBookings.push(b);
    }

    if (isFarmhouse) {
      console.log(`Count after suppression:`, propBookings.length - suppressedCount);
      console.log(`---------------------------\n`);
    }
  }

  filteredBookings = finalPreCleaningBookings;

  console.log("FINAL PAYLOAD IDS IN RANGE:");
  filteredBookings.forEach(b => {
    console.log(`  - ${b.id}`);
  });
  console.log("Are 17f2e875 and 9ed2d84c present?");
  const hasFirst = filteredBookings.some(b => b.raw_data?.uid === '17f2e875-6121-48a0-8b0d-9d82645c60e8');
  const hasSecond = filteredBookings.some(b => b.raw_data?.uid === '9ed2d84c-244e-42a1-afa5-109b4a41cf40');
  console.log("  17f2e875 (Pre-buffer):", hasFirst);
  console.log("  9ed2d84c (Post-buffer):", hasSecond);
}

run();
