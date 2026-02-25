import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
    const email = 'sidravaines@gmail.com';
    console.log(`Finding user ${email}...`);

    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) {
        console.error('List users error:', userError);
        return;
    }

    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
        console.error('User not found in Auth');
        return;
    }

    console.log(`User ID: ${user.id}`);

    // Update permissions
    const { error } = await supabase
        .from('cohost_workspace_members')
        .update({
            can_view_guest_count: true,
            // Ensure other cleaner restrictions are enforced if needed, but for now just fix this
        })
        .eq('user_id', user.id);

    if (error) {
        console.error('Update error:', error);
    } else {
        console.log('Successfully updated can_view_guest_count = true for', email);
    }
}

run();
