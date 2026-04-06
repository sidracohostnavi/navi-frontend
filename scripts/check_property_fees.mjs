import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('cohost_properties')
    .select('id, name, base_nightly_rate, extra_guest_fee')
    .limit(10);
  
  if (error) {
    console.error(error);
    return;
  }
  
  console.log('Properties, base rates, and extra fees:');
  data.forEach(p => {
    console.log(`${p.name}: Rate=${p.base_nightly_rate}, ExtraFee=${p.extra_guest_fee}`);
  });
}

run();
