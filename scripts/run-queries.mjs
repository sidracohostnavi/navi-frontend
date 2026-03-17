import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("=================== QUERY 1 ===================");
  const { data: q1, error: e1 } = await supabase.from('bookings').select(`
    id, guest_name, enriched_guest_name, check_in, check_out, property_id,
    cohost_properties!inner ( name ), raw_data
  `)
    .eq('is_active', true)
    .is('enriched_guest_name', null)
    .gte('check_in', '2026-03-01')
    .not('guest_name', 'in', '("Not Available","Closed Period", "Reservation")')
    .order('check_in')
    .limit(20);
  if (e1) console.error(e1);
  else console.log(JSON.stringify(q1?.map(b => ({
    id: b.id, guest_name: b.guest_name, enriched_guest_name: b.enriched_guest_name,
    check_in: b.check_in, check_out: b.check_out, property_id: b.property_id,
    property_name: b.cohost_properties?.name, description: b.raw_data?.description, summary: b.raw_data?.summary
  })), null, 2));

  console.log("=================== QUERY 2 ===================");
  const { data: q2, error: e2 } = await supabase.from('reservation_facts').select(`
    id, guest_name, confirmation_code, check_in, check_out, connection_id,
    connections ( name )
  `)
    .in('check_in', ['2026-03-29', '2026-04-20', '2026-07-05'])
    .order('check_in');
  if (e2) console.error(e2);
  else console.log(JSON.stringify(q2?.map(f => ({
    id: f.id, guest_name: f.guest_name, confirmation_code: f.confirmation_code,
    check_in: f.check_in, check_out: f.check_out, connection_id: f.connection_id, connection_name: f.connections?.name
  })), null, 2));

  console.log("=================== QUERY 3 ===================");
  const { data: q3, error: e3 } = await supabase.from('bookings').select(`
    id, guest_name, enriched_guest_name, enriched_connection_id, enriched_at, check_in, check_out, raw_data
  `)
    .gte('check_in', '2026-03-18')
    .lt('check_in', '2026-03-19')
    .ilike('guest_name', '%Not available%');
  if (e3) console.error(e3);
  else console.log(JSON.stringify(q3?.map(b => ({
    id: b.id, guest_name: b.guest_name, enriched_guest_name: b.enriched_guest_name,
    enriched_connection_id: b.enriched_connection_id, enriched_at: b.enriched_at,
    check_in: b.check_in, check_out: b.check_out, legacy_fact_id: b.raw_data?.from_fact_id, description: b.raw_data?.description
  })), null, 2));

  console.log("=================== QUERY 4 ===================");
  const { data: q4, error: e4 } = await supabase.from('gmail_sync_log').select(`
    connection_id, success, error_message, emails_scanned, bookings_enriched, duration_ms, created_at
  `).order('created_at', { ascending: false }).limit(10);
  if (e4) console.error(e4);
  else console.log(JSON.stringify(q4, null, 2));

  console.log("=================== QUERY 5 ===================");
  const { data: q5, error: e5 } = await supabase.from('bookings').select(`
    id, guest_name, check_in, raw_data
  `)
    .eq('is_active', true)
    .is('enriched_guest_name', null)
    .gte('check_in', '2026-03-01')
    .eq('guest_name', 'Reserved')
    .order('check_in')
    .limit(20);
  if (e5) console.error(e5);
  else console.log(JSON.stringify(q5?.map(b => {
    const desc = b.raw_data?.description || '';
    let code_status = 'NO_CODE';
    if (desc.includes('/details/HM') || desc.includes('/details/B')) code_status = 'HAS_CODE';
    return {
      id: b.id, guest_name: b.guest_name, check_in: b.check_in,
      description: desc, code_status
    };
  }), null, 2));
}

run();
