import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('cohost_workspace_invites').select('id, token_hash, token_last4, invite_url, invitee_email, status, created_at, expires_at').order('created_at', { ascending: false }).limit(5);
  if (error) {
     console.error(error);
  } else {
     console.log(JSON.stringify(data, null, 2));
  }
}

run();
