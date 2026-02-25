require('dotenv').config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("Fetching bookings for April 4-6...");
  const { data: bRes } = await supabase.query(`
    SELECT id, workspace_id, property_id, platform, source_feed_id, check_in, check_out, guest_name, guest_count,
           raw_data->>'enriched_from_fact' AS enriched_from_fact,
           matched_connection_id,
           updated_at
    FROM bookings
    WHERE is_active = true
      AND check_in::date = '2026-04-04'
      AND check_out::date = '2026-04-06'
  `);
  
  console.dir(bRes);
}

run();
