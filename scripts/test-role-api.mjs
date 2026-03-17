import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// We must test this AS the user, not as service role, to see what the API actually gets from getCurrentUserWithWorkspace()
// The easiest way is to mock what the API route does by calling the exact same Supabase queries but filtering strictly by the user's ID.

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const userId = '3e858192-3b6b-4f49-8065-1d3fd8cc714d';
  
  // 1. Get workspace ID from user preferences (This is what authServer.ts does)
  const { data: pref } = await supabase.from('cohost_user_preferences').select('workspace_id').eq('user_id', userId).single();
  console.log("User Preference Workspace ID:", pref?.workspace_id);
  
  // 2. Query the role
  const { data: member } = await supabase
        .from('cohost_workspace_members')
        .select('role, role_label, is_active, workspace_id')
        .eq('user_id', userId);
        
  console.log("All memberships for this user:");
  console.log(JSON.stringify(member, null, 2));

}
run();
