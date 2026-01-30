import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TARGET_EMAIL = 'sidra.navicohost@gmail.com';
const TARGET_WORKSPACE_ID = '1188717b-61e1-48fc-8ba5-20242c01a0df';

async function fix() {
    console.log(`\n=== Fixing workspace preference for ${TARGET_EMAIL} ===\n`);

    // 1. Get User ID
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const user = users?.find(u => u.email === TARGET_EMAIL);

    if (!user) {
        console.error('User not found!');
        return;
    }
    console.log(`User ID: ${user.id}`);

    // 2. Upsert Preference
    const { error } = await supabase
        .from('cohost_user_preferences')
        .upsert({
            user_id: user.id,
            workspace_id: TARGET_WORKSPACE_ID,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

    if (error) {
        console.error('Error updating preference:', error);
        return;
    }

    console.log('✅ Preference updated to', TARGET_WORKSPACE_ID);

    // 3. Generate NEW Magic Link
    console.log(`Generating NEW link for ${user.email}...`);

    const { data, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: user.email!,
        options: {
            redirectTo: 'http://localhost:3000/cohost/dashboard'
        }
    });

    if (linkError) console.error('Error generating link:', linkError);
    else {
        console.log('\nMAGIC_LINK:', data.properties?.action_link);
    }
}

fix();
