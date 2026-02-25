import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual env loading
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^['"]|['"]$/g, '');
        env[key] = value;
    }
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseServiceKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixPermissions(email: string) {
    console.log(`Fixing permissions for ${email}...`);

    // 1. Get User
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) {
        console.error('Error listing users:', userError);
        return;
    }
    const user = users.find(u => u.email === email);
    if (!user) return console.log('User not found');

    // 2. Get Memberships
    const { data: members, error: memError } = await supabase
        .from('cohost_workspace_members')
        .select('*')
        .eq('user_id', user.id);

    if (!members || members.length === 0) return console.log('No memberships found');

    for (const m of members) {
        console.log(`Found membership in workspace ${m.workspace_id}, Role: ${m.role}`);

        // Only patch if role is cleaner
        if (m.role === 'cleaner') {
            console.log(`- Patching permissions (hiding guest names/counts/details)...`);
            const { error } = await supabase
                .from('cohost_workspace_members')
                .update({
                    can_view_guest_name: false,
                    can_view_guest_count: false,
                    can_view_booking_notes: false,
                    can_view_contact_info: false
                })
                .eq('workspace_id', m.workspace_id)
                .eq('user_id', user.id);

            if (error) console.error('Error updating:', error);
            else console.log('Success! Permissions updated.');
        } else {
            console.log('- Skipping (not cleaner)');
        }
    }
}

fixPermissions('sidravaines@gmail.com');
