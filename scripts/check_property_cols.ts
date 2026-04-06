
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkSchema() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('cohost_properties')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching property:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('Columns in cohost_properties:', Object.keys(data[0]));
  } else {
    console.log('No properties found to check columns.');
  }
}

checkSchema();
