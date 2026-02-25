const { Client } = require("pg");

async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:GUUbfO0k4tNJHVn6@db.axwepnpgkfodkyjtownf.supabase.co:5432/postgres" });
  await client.connect();

  const res1 = await client.query(`
    SELECT
      id, property_id, platform, source_feed_id, source_type, status,
      check_in, check_out, guest_name, external_uid,
      raw_data->>'summary' AS summary
    FROM bookings
    WHERE property_id = '99c9875e-07c1-4e5d-bc01-3a5b9c1b0937'
      AND is_active = true
      AND check_out >= '2026-03-01'::date
      AND check_in  < '2026-04-01'::date
    ORDER BY check_in ASC, check_out ASC;
  `);

  let filteredBookings = res1.rows.map(ro => {
    // pg returns check_in / check_out as Date objects, convert to ISO strings just like DB returns to the frontend
    return {
      ...ro,
      check_in: ro.check_in.toISOString(),
      check_out: ro.check_out.toISOString(),
      raw_data: { summary: ro.summary }
    };
  });

  console.log("Input Bookings:", filteredBookings.length);
  
  const addDaysToIso = (iso, days) => {
    const dateStr = iso.split('T')[0];
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
  };

  const bookingsByPropertyFilters = new Map();
  for (const b of filteredBookings) {
    if (!bookingsByPropertyFilters.has(b.property_id)) {
      bookingsByPropertyFilters.set(b.property_id, []);
    }
    bookingsByPropertyFilters.get(b.property_id).push(b);
  }

  const postLodgifyBookings = [];

  for (const propertyBookings of bookingsByPropertyFilters.values()) {
    const genericLodgifyBlocks = [];
    const realBookings = [];

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

      const coveredDays = new Set();
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
      } else {
        console.log(`SUPPRESSED: [${genBlock.platform}] ${genBlock.guest_name} from ${genBlock.check_in} to ${genBlock.check_out}`);
      }
    }
  }

  filteredBookings = postLodgifyBookings;

  console.log("Output Bookings:", filteredBookings.length);
  filteredBookings.sort((a,b)=> a.check_in.localeCompare(b.check_in)).forEach(b => console.log(`- [${b.platform}] ${b.guest_name} (${b.check_in.split('T')[0]} to ${b.check_out.split('T')[0]})`));

  await client.end();
}
run();
