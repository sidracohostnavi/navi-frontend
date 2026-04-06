import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function findProperty() {
  const { data, error } = await supabase
    .from('cohost_properties')
    .select('id, name, workspace_id')
    .ilike('name', '%Aloha Magic Cottage%');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log('Properties:', JSON.stringify(data, null, 2));
}

findProperty();
