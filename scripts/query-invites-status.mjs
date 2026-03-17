import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('cohost_workspace_invites').select('id, invitee_email, status, expires_at, created_at, accepted_at, token_last4').order('created_at', { ascending: false }).limit(10);
  console.log(data);
}
run();
