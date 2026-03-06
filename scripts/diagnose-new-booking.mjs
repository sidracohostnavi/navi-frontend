import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    console.log("=== 1. ical_sync_log (last 10) ===");
    const { data: icalLogs, error: e1 } = await supabase
      .from('ical_sync_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    if (e1) {
      console.error(e1);
    } else {
      console.table(icalLogs);
    }

    console.log("\n=== 2. gmail_sync_log (last 10) ===");
    const { data: gmailLogs, error: e2 } = await supabase
      .from('gmail_sync_log')
      .select('connection_id, success, emails_scanned, bookings_enriched, review_items_created, error_message, synced_at')
      .order('synced_at', { ascending: false })
      .limit(10);
    if (e2) {
      console.error(e2);
    } else {
      console.table(gmailLogs);
    }

    console.log("\n=== 3. ical_feeds (Lodgify/Spark & Stay) ===");
    const { data: feeds, error: e3 } = await supabase
      .from('ical_feeds')
      .select('id, property_id, source_name, source_type, ical_url, last_synced_at, is_active')
      .ilike('source_name', '%lodg%') // or just all of them. Let's get all active
      .order('created_at', { ascending: false });
    if (e3) {
      console.error(e3);
    } else {
      console.table(feeds);
    }

    console.log("\n=== 4. Bookings in last 3 hours ===");
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data: recentBookings, error: e4 } = await supabase
      .from('bookings')
      .select('id, property_id, guest_name, check_in, check_out, source_type, created_at')
      .gte('created_at', threeHoursAgo)
      .order('created_at', { ascending: false });
    if (e4) {
      console.error(e4);
    } else {
      console.table(recentBookings);
    }
  } catch (e) {
    console.error("Caught error:", e);
  }
}

run().then(() => process.exit(0));
