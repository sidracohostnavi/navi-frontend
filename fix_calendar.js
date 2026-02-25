const fs = require('fs');
const file = "/Users/sidra/Documents/GitHub/navi-frontend/app/api/cohost/calendar/route.ts";
let content = fs.readFileSync(file, 'utf8');

// 1. const filteredBookings -> let filteredBookings
content = content.replace("const filteredBookings = ((bookings || []) as any[]).filter((b: any) => {", "let filteredBookings = ((bookings || []) as any[]).filter((b: any) => {");

// 2. Hoist addDaysToIso and add suppression logic
const replacement = `  // ─── END ENRICHMENT ─────────────────────────────────────────────────

  const addDaysToIso = (iso: string, days: number) => {
    // Ensure we are working with pure YYYY-MM-DD
    const dateStr = iso.split('T')[0];
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
  };

  // ─── SUPPRESS COVERED LODGIFY BLOCKS ────────────────────────────────
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
      if (b.platform === 'Lodgify' && (
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

  // ─── PHASE 2: GENERATE CLEANING BUFFERS ─────────────────────────────`;

content = content.replace("  // ─── END ENRICHMENT ─────────────────────────────────────────────────\n\n  // ─── PHASE 2: GENERATE CLEANING BUFFERS ─────────────────────────────", replacement);

// 3. Remove addDaysToIso from below
content = content.replace(`  const addDaysToIso = (iso: string, days: number) => {
    // Ensure we are working with pure YYYY-MM-DD
    const dateStr = iso.split('T')[0];
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
  };

  const isHold`, "  const isHold");

fs.writeFileSync(file, content);
console.log("Patched!");
