
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMappings() {
    const { data: mappings } = await supabase.from('connection_properties').select('*');
    console.log('Mappings:', mappings);

    const { data: conns } = await supabase.from('connections').select('id, name, platform, color_hex');
    console.log('Connections:', conns);
}

checkMappings();
