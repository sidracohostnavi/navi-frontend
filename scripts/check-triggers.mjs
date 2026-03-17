import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('get_triggers_for_table', { table_name: 'cohost_workspace_invites' }).catch(() => ({ error: 'rpc failed' }));
  
  // Or just query pg_trigger directly if we can't use rpc
  // Let's write a direct postgres query string
}

run();
