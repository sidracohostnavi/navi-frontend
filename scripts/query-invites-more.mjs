import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data } = await supabase.from('cohost_workspace_invites').select('id, token_hash, token_last4, invite_url, status, created_at').order('created_at', { ascending: false }).limit(20);

  for (const row of data) {
    if (!row.invite_url) continue;
    try {
      const urlToken = new URL(row.invite_url).searchParams.get('token');
      const computedHash = crypto.createHash('sha256').update(urlToken).digest('hex');
      const match = computedHash === row.token_hash;
      console.log(`${row.created_at} | Match: ${match} | URL: ${row.token_last4} | DB Last4: ${row.token_last4}`);
      if (!match) {
        console.log('  DB HASH:', row.token_hash);
        console.log('  URL VAL:', urlToken);
        console.log('  URL HASH:', computedHash);
      }
    } catch (e) { }
  }
}

run();
