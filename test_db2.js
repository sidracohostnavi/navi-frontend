const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const check_in_str = '2026-04-08T12:00:00+00:00';
  const check_out_str = '2026-04-09T12:00:00+00:00';
  const prop_id = '3596be29-8b42-456f-9fb1-85625a34c946';
  
  const { data } = await supabase.from('bookings').select('*').eq('property_id', prop_id).eq('check_in', check_in_str);
  console.log('Hold Booking Full Data:', data[0]);

  const unenriched_in = '2026-03-13T12:00:00+00:00';
  const { data: d2 } = await supabase.from('bookings').select('*').eq('property_id', prop_id).eq('check_in', unenriched_in);
  console.log('Unenriched Booking Full Data:', d2[0]);
}

check();
