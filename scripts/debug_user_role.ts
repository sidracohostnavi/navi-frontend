import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual env loading to avoid dependencies
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
    console.error('Missing credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUser(email: string) {
    console.log(`Checking user: ${email}`);

    // 1. Get User ID
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) {
        console.error('Error listing users:', userError);
        return;
    }

    const user = users.find(u => u.email === email);

    if (!user) {
        console.log('User not found in Auth system');
        return;
    }
    console.log(`User ID: ${user.id}`);

    // 2. Get Preferences
    const { data: pref, error: prefError } = await supabase
        .from('cohost_user_preferences')
        .select('workspace_id, updated_at')
        .eq('user_id', user.id)
        .single();

    if (pref) {
        console.log('Current Preference:', pref);
        const { data: ws } = await supabase.from('cohost_workspaces').select('name, id').eq('id', pref.workspace_id).single();
        console.log(`ACTIVE WORKSPACE: ${ws?.name} (${ws?.id})`);

        const { data: activeMember } = await supabase.from('cohost_workspace_members')
            .select('role')
            .eq('workspace_id', pref.workspace_id)
            .eq('user_id', user.id)
            .single();
        console.log(`ROLE IN ACTIVE WORKSPACE: ${activeMember?.role}`);
    } else {
        console.log('No preference found');
    }

    // 3. Get ALL Memberships
    const { data: members } = await supabase
        .from('cohost_workspace_members')
        .select('workspace_id, role, is_active')
        .eq('user_id', user.id);

    console.log('\n--- ALL MEMBERSHIPS ---');
    if (members && members.length > 0) {
        for (const m of members) {
            const { data: w } = await supabase.from('cohost_workspaces').select('name').eq('id', m.workspace_id).single();
            console.log(`- Workspace: ${w?.name} (${m.workspace_id})`);
            console.log(`  Role: ${m.role}`);
            console.log(`  Active: ${m.is_active}`);
        }
    } else {
        console.log('No memberships found');
    }
}

checkUser('sidravaines@gmail.com');
