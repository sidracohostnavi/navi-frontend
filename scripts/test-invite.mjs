import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const tokenLast4 = token.slice(-4);

  console.log("GENERATED TOKEN:", token);
  console.log("GENERATED HASH:", tokenHash);

  // Lets ping the actual API route to let IT do it, then fetch the latest record
  const res = await fetch('http://localhost:3000/api/cohost/users/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invitee_email: 'test' + Date.now() + '@example.com',
      permissions: { can_view_calendar: true }
    })
  });

  const json = await res.json();
  console.log("API Response:", json);

  if (json.invite_id) {
    const { data } = await supabase.from('cohost_workspace_invites').select('*').eq('id', json.invite_id).single();
    console.log("DB RECORD:", data);

    const urlToken = new URL(data.invite_url).searchParams.get('token');
    console.log("URL TOKEN:", urlToken);
    console.log("HASH OF URL TOKEN:", crypto.createHash('sha256').update(urlToken).digest('hex'));
    console.log("MATCHES DB?", crypto.createHash('sha256').update(urlToken).digest('hex') === data.token_hash);
  }
}

run();
