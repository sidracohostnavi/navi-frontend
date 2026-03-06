require('dotenv').config({ path: '/Users/sidra/Documents/GitHub/navi-frontend/.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FARMHOUSE_ID = '3596be29-8b42-456f-9fb1-85625a34c946';

function addDaysToIso(iso: string, days: number) {
  const dateStr = iso.includes('T') ? iso.split('T')[0] : iso;
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

const isoDate = (d: any) => new Date(d).toISOString().slice(0, 10);

const isHold = (b: any) => {
  if (!!b.matched_connection_id || !!b.manual_connection_id || !!b.manually_resolved_at) return false;
  if (!b.guest_name) return true;
  const gn = b.guest_name.toLowerCase();
  const keywords = ['cleaning', 'maintenance', 'hold', 'blocked', 'unavailable', 'reservation', 'reserved'];
  if (keywords.some((k: string) => gn.includes(k))) return true;
  return ['guest', 'not available', 'closed period', 'airbnb (not available)'].includes(gn);
};

async function run() {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, property_id, platform, guest_name, check_in, check_out, source_feed_id, manual_connection_id, manually_resolved_at, is_active')
    .eq('property_id', FARMHOUSE_ID)
    .eq('is_active', true)
    .gte('check_out', '2026-03-01')
    .lte('check_in', '2026-04-30')
    .order('check_in');

  if (error) { console.error(error); return; }

  let filteredBookings = bookings || [];

  // SIMULATE PHASE 1: Suppress Covered Lodgify Blocks (lines 183-248)
  const bookingsByPropertyFilters = new Map<string, any[]>();
  for (const b of filteredBookings) {
    if (!bookingsByPropertyFilters.has(b.property_id)) bookingsByPropertyFilters.set(b.property_id, []);
    bookingsByPropertyFilters.get(b.property_id)!.push(b);
  }

  const postLodgifyBookings: any[] = [];
  for (const propertyBookings of bookingsByPropertyFilters.values()) {
    const genericLodgifyBlocks: any[] = [];
    const realBookingsPhase1: any[] = [];

    for (const b of propertyBookings) {
      if (b.platform === 'Lodgify' && (
        ['Not Available', 'Closed Period'].includes(b.guest_name)
      )) {
        genericLodgifyBlocks.push(b);
      } else {
        realBookingsPhase1.push(b);
      }
    }
    postLodgifyBookings.push(...realBookingsPhase1);
    // Skip the covered-days logic for brevity; PT rows wouldn't be in genericLodgifyBlocks anyway
    for (const g of genericLodgifyBlocks) {
      postLodgifyBookings.push(g); // keep all for now
    }
  }
  filteredBookings = postLodgifyBookings;

  console.log(`After Phase 1 (Covered Lodgify): ${filteredBookings.length} bookings`);
  const ptAfterPhase1 = filteredBookings.filter(b => b.guest_name?.includes('P**'));
  console.log(`  PT rows surviving Phase 1: ${ptAfterPhase1.length}`);
  for (const pt of ptAfterPhase1) {
    console.log(`    ${pt.id.substring(0, 8)} | ${pt.guest_name} | ${isoDate(pt.check_in)} -> ${isoDate(pt.check_out)}`);
  }

  // SIMULATE fetching policy
  const { data: policy } = await supabase
    .from('cohost_properties')
    .select('id, cleaning_pre_days, cleaning_post_days')
    .eq('id', FARMHOUSE_ID)
    .single();

  const policyMap = new Map<string, any>();
  if (policy) policyMap.set(policy.id, policy);

  const preDays = policy?.cleaning_pre_days || 0;
  const postDays = policy?.cleaning_post_days || 0;

  // SIMULATE Phase 2: Buffer suppression (lines 286-358)
  const finalPreCleaningBookings: any[] = [];
  const bookingsByPropBuffer = new Map<string, any[]>();
  for (const b of filteredBookings) {
    if (!bookingsByPropBuffer.has(b.property_id)) bookingsByPropBuffer.set(b.property_id, []);
    bookingsByPropBuffer.get(b.property_id)!.push(b);
  }

  for (const [propId, propBookings] of bookingsByPropBuffer.entries()) {
    const pol = policyMap.get(propId);
    if (!pol || (pol.cleaning_pre_days === 0 && pol.cleaning_post_days === 0)) {
      finalPreCleaningBookings.push(...propBookings);
      continue;
    }

    const realBookings = propBookings.filter((b: any) => {
      const isEnriched = !!(b.raw_data && b.raw_data.enriched_from_fact);
      const isManual = !!b.manual_connection_id || !!b.manually_resolved_at;
      return isEnriched || isManual || !isHold(b);
    });

    console.log(`\n  REAL BOOKINGS for buffer comparison (policy prop ${propId.substring(0, 8)}):`);
    for (const r of realBookings) {
      console.log(`    ${r.id.substring(0, 8)} | ${r.guest_name} | ${isoDate(r.check_in)} -> ${isoDate(r.check_out)} | isHold=${isHold(r)}`);
    }

    for (const b of propBookings) {
      if (b.platform?.trim() === 'Lodgify') {
        const isEnriched = !!(b.raw_data && b.raw_data.enriched_from_fact);
        if (isEnriched) {
          finalPreCleaningBookings.push(b);
          continue;
        }

        const bIn = isoDate(b.check_in);
        const bOut = isoDate(b.check_out);

        const bInDate = new Date(bIn);
        const bOutDate = new Date(bOut);
        const blockDurationDays = Math.round((bOutDate.getTime() - bInDate.getTime()) / (1000 * 60 * 60 * 24));

        const isBuffer = realBookings.some((real: any) => {
          if (real.id === b.id) return false;
          const rIn = isoDate(real.check_in);
          const rOut = isoDate(real.check_out);

          if (preDays > 0 && blockDurationDays === preDays) {
            const expectedPreIn = addDaysToIso(rIn, -preDays);
            if (bIn === expectedPreIn && bOut === rIn) return true;
          }
          if (postDays > 0 && blockDurationDays === postDays) {
            const expectedPostOut = addDaysToIso(rOut, postDays);
            if (bIn === rOut && bOut === expectedPostOut) return true;
          }
          return false;
        });

        if (isBuffer) {
          console.log(`  🚫 SUPPRESSED: ${b.id.substring(0, 8)} ${b.guest_name} (${bIn}->${bOut})`);
          continue;
        }
      }
      finalPreCleaningBookings.push(b);
    }
  }

  filteredBookings = finalPreCleaningBookings;
  console.log(`\nAfter Phase 2 (Buffer Suppression): ${filteredBookings.length} bookings`);
  const ptAfterPhase2 = filteredBookings.filter(b => b.guest_name?.includes('P**'));
  console.log(`  PT rows surviving Phase 2: ${ptAfterPhase2.length}`);
  for (const pt of ptAfterPhase2) {
    console.log(`    ⚠️  ${pt.id.substring(0, 8)} | ${pt.guest_name} | ${isoDate(pt.check_in)} -> ${isoDate(pt.check_out)}`);
  }

  // SIMULATE final hold filter (lines 439-474)
  const finalBookings = filteredBookings.filter((b: any) => {
    if (!isHold(b)) return true;
    if (b.platform?.trim() === 'Lodgify') return true;

    const pol = policyMap.get(b.property_id);
    const policyEnabled = !!(pol && (pol.cleaning_pre_days > 0 || pol.cleaning_post_days > 0));
    if (policyEnabled) return false;
    return true;
  });

  console.log(`\nAfter Final Hold Filter: ${finalBookings.length} bookings`);
  const ptFinal = finalBookings.filter(b => b.guest_name?.includes('P**'));
  console.log(`  PT rows in FINAL output: ${ptFinal.length}`);
  for (const pt of ptFinal) {
    console.log(`    ⚠️  ${pt.id.substring(0, 8)} | ${pt.guest_name} | ${isoDate(pt.check_in)} -> ${isoDate(pt.check_out)}`);
  }
}

run().catch(console.error);
