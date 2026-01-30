import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const email = 'sidra.navicohost@gmail.com';

async function run() {
    const { data, error } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: 'http://localhost:3000/cohost/dashboard' }
    });
    if (error) console.error(error);
    else console.log('LINK:', data.properties?.action_link);
}
run();
