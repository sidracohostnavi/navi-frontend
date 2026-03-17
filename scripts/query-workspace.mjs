import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: ws, error: wsErr } = await supabase.from('cohost_workspaces')
    .select('id, name, created_by')
    .eq('id', '1188717b-61e1-48fc-8ba5-20242c01a0df')
    .single();
  
  const { data: users, error: uErr } = await supabase.auth.admin.listUsers();
  const chrisUser = users?.users?.find(u => u.email === 'chrisafir@gmail.com');
  
  console.log("=== Workspace ===");
  console.log(ws);
  console.log("\n=== Chris User ID ===");
  console.log(chrisUser?.id);
  console.log("\nMatches created_by?", ws?.created_by === chrisUser?.id);
}
run();
