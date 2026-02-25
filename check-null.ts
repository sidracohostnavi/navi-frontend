import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
    console.log("Fetching all facts...");
    const { data: facts, error } = await supabase.from('reservation_facts').select('*');
    if (error) { 
        console.error("Error:", error);
    } else {
        const nullNames = (facts || []).filter(f => f.guest_name === null || f.guest_name === undefined);
        console.log(`Total facts: ${facts?.length}. Null guest names: ${nullNames.length}`);
        if (nullNames.length > 0) {
            console.log("Example:", nullNames[0]);
        }
    }
}
main();
