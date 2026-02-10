
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateColor() {
    // 1. Get Connections
    const { data: conns } = await supabase.from('connections').select('id, name, platform, color_hex');

    if (!conns || conns.length === 0) {
        console.log('No connections found.');
        return;
    }

    console.log('Current Connections:', conns);

    // 2. Pick Sidra A/C explicitly
    const targetId = '76dd4b3b-ea77-4ef2-802d-eaf73295c358';
    const newColor = '#9333EA'; // Purple 600

    console.log(`Updating ${targetId} to ${newColor}...`);

    const { error } = await supabase
        .from('connections')
        .update({ color_hex: newColor })
        .eq('id', targetId);

    if (error) console.error('Error:', error);
    else console.log('Success!');
}

updateColor();
