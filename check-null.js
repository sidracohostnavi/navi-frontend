require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data: facts, error } = await supabase.from('reservation_facts').select('*');
    if (error) { 
        console.error("Error:", error);
    } else {
        const nullNames = (facts || []).filter(f => f.guest_name === null);
        console.log(`Total facts: ${facts?.length}. Null guest names: ${nullNames.length}`);
        if (nullNames.length > 0) {
            console.log("Example null guest_name fact:", nullNames[0]);
        }
    }
}
main();
