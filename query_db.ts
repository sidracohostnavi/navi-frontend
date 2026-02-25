import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
    const { data: properties } = await supabase.from('cohost_properties').select('id, name').ilike('name', '%Green Cottage%');
    console.log('Properties:', properties);
}
main();
