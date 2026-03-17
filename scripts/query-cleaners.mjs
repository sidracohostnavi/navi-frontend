import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("=== QUERY 1: Comparing the two cleaner accounts ===");
  const { data: q1, error: e1 } = await supabase.from('cohost_workspace_members')
      .select('role, user_id, workspace_id, created_at, users:user_id (email)')
      .in('users.email', ['chrisafir@gmail.com', 'sidravaines@gmail.com'])
      .order('created_at', { ascending: false });
  
  if (e1) {
     console.error("Q1 Error via REST, falling back to direct SQL string...", e1);
     // Fallback to rpc or direct raw sql if possible
  } else {
     // The inner join filter might not work perfectly with PostgREST syntax if users table is auth.users
     // We will fetch all and filter in JS if needed. Let's do a broader fetch just in case.
     const { data: allMembers } = await supabase.from('cohost_workspace_members').select('role, user_id, workspace_id, created_at, users:user_id (email)');
     const filtered = (allMembers || []).filter(m => m.users && ['chrisafir@gmail.com', 'sidravaines@gmail.com'].includes(m.users.email));
     console.log(JSON.stringify(filtered, null, 2));
  }

  console.log("\n=== QUERY 2: Checking for duplicate workspace member entries ===");
  const { data: allMembers2 } = await supabase.from('cohost_workspace_members').select('user_id, users:user_id (email)');
  
  const counts = {};
  (allMembers2 || []).forEach(m => {
     if (m.users && m.users.email) {
         counts[m.users.email] = (counts[m.users.email] || 0) + 1;
     }
  });
  
  const duplicates = Object.entries(counts).filter(([email, count]) => count > 1);
  if (duplicates.length === 0) {
      console.log("No users have duplicate workspace entries.");
  } else {
      console.log("Users with multiple workspace entries:", duplicates);
  }
}
run();
