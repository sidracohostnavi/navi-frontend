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
    .lte('check_in', '2026-03-26')
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

  const finalPreCleaningBookings: any[] = [];
  
  const bookingsByPropBuffer = new Map<string, any[]>();
  for (const b of filteredBookings) {
    if (!bookingsByPropBuffer.has(b.property_id)) bookingsByPropBuffer.set(b.property_id, []);
    bookingsByPropBuffer.get(b.property_id)!.push(b);
  }

  const isoDate = (d: any) => new Date(d).toISOString().slice(0, 10);

  for (const [propId, propBookings] of bookingsByPropBuffer.entries()) {
    const policy = policyMap.get(propId);
    
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

        const isBuffer = realBookings.some(real => {
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
          continue;
        }
      }
      finalPreCleaningBookings.push(b);
    }
  }

  filteredBookings = finalPreCleaningBookings;

  // Next suppression block (old suppression)
  const bookingsByPropertyFilters = new Map<string, any[]>();
  for (const b of filteredBookings) {
    if (!bookingsByPropertyFilters.has(b.property_id)) {
      bookingsByPropertyFilters.set(b.property_id, []);
    }
    bookingsByPropertyFilters.get(b.property_id)!.push(b);
  }

  const postLodgifyBookings: any[] = [];

  for (const propertyBookings of bookingsByPropertyFilters.values()) {
    const genericLodgifyBlocks: any[] = [];
    const realBookings: any[] = [];

    for (const b of propertyBookings) {
      if (b.platform?.trim() === 'Lodgify' && (
        ['Not Available', 'Closed Period'].includes(b.guest_name) ||
        (b.raw_data && ['Not Available', 'Closed Period'].includes(b.raw_data.summary))
      )) {
        genericLodgifyBlocks.push(b);
      } else {
        realBookings.push(b);
      }
    }

    postLodgifyBookings.push(...realBookings);

    for (const genBlock of genericLodgifyBlocks) {
      const gIn = genBlock.check_in.split('T')[0];
      const gOut = genBlock.check_out.split('T')[0];

      const coveredDays = new Set<string>();
      for (const realB of realBookings) {
        const rIn = realB.check_in.split('T')[0];
        const rOut = realB.check_out.split('T')[0];
        let curr = rIn;
        let count = 0;
        while (curr < rOut && count < 365) {
          if (curr >= gIn && curr < gOut) {
            coveredDays.add(curr);
          }
          curr = addDaysToIso(curr, 1);
          count++;
        }
      }

      let isFullyCovered = true;
      let currGen = gIn;
      let countGen = 0;
      while (currGen < gOut && countGen < 365) {
        if (!coveredDays.has(currGen)) {
          isFullyCovered = false;
          break;
        }
        currGen = addDaysToIso(currGen, 1);
        countGen++;
      }

      if (!isFullyCovered) {
        postLodgifyBookings.push(genBlock);
      }
    }
  }

  filteredBookings = postLodgifyBookings;

  const targetId = '41969cde-a796-479b-8fb0-60e60169a237';
  const found = filteredBookings.some(b => b.id === targetId);
  console.log(`Is booking ${targetId} in the final payload? ${found}`);
}

run();
