import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('cohost_workspace_members').select('*');
  
  if (error) {
     console.error(error);
     return;
  }
  
  // Since we can't easily join auth.users via REST API, let's fetch the users first
  const { data: users, error: uErr } = await supabase.auth.admin.listUsers();
  const emailMap = {};
  if (users && users.users) {
     users.users.forEach(u => emailMap[u.id] = u.email);
  }

  const mapped = data.map(m => ({ ...m, email: emailMap[m.user_id] }));
  
  const targets = mapped.filter(m => ['chrisafir@gmail.com', 'sidravaines@gmail.com'].includes(m.email));
  console.log("=== Target Users ===");
  console.log(JSON.stringify(targets, null, 2));

  const counts = {};
  mapped.forEach(m => {
     if (m.email) {
         counts[m.email] = (counts[m.email] || 0) + 1;
     }
  });

  const duplicates = Object.entries(counts).filter(([email, count]) => count > 1);
  console.log("\n=== Duplicates ===");
  console.log(duplicates.length ? duplicates : "None");
}
run();
