import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: q4, error: e4 } = await supabase.from('gmail_sync_log').select('*').limit(10);
  if (e4) console.error(e4);
  else console.log(JSON.stringify(q4, null, 2));
}

run();
