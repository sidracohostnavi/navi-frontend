import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('property_date_pricing')
    .select('*')
    .limit(10);
  
  if (error) {
    console.error(error);
    return;
  }
  
  console.log('Date pricing overrides:');
  console.log(JSON.stringify(data, null, 2));
}

run();
