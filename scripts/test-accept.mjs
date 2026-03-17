import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // Take one of the pending invites
  const { data: invites } = await supabase.from('cohost_workspace_invites').select('*').eq('status', 'pending').limit(1);
  if (!invites || invites.length === 0) {
    console.log("No pending invites found.");
    return;
  }

  const invite = invites[0];
  console.log("TESTING INVITE:", invite.id);
  console.log("invite_url:", invite.invite_url);

  // Extract token from URL
  const token = new URL(invite.invite_url).searchParams.get('token');
  console.log("Extracted token:", token);

  // Simulate accept/route.ts exactly
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  console.log("Computed tokenHash:", tokenHash);

  const { data: fetchedInvite, error } = await supabase
    .from('cohost_workspace_invites')
    .select('*')
    .eq('token_hash', tokenHash)
    .eq('status', 'pending')
    .single();

  if (error || !fetchedInvite) {
    console.error("FAILED TO FIND INVITE BY HASH! Error:", error);
  } else {
    console.log("SUCCESSFULLY FOUND INVITE!");
  }
}
run();
