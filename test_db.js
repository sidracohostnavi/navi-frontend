const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data: props } = await supabase.from('cohost_properties').select('id, name, cleaning_pre_days, cleaning_post_days').ilike('name', '%Farmhouse%');
  console.log('Props:', props);
  
  if (props && props.length > 0) {
    const { data: bks } = await supabase.from('bookings').select('id, check_in, check_out, guest_name, guest_count, source_type, status, needs_review').eq('property_id', props[0].id).order('check_in', {ascending: false}).limit(10);
    console.log('Bookings:', bks);
  }
}

check();
