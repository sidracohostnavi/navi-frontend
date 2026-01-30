import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TARGET_EMAIL = 'sidra.navicohost@gmail.com';

async function verify() {
    console.log(`\n=== Verifying data for ${TARGET_EMAIL} ===\n`);

    // 1. Get User ID
    const { data: { users }, error: uErr } = await supabase.auth.admin.listUsers();
    const user = users?.find(u => u.email === TARGET_EMAIL);

    if (!user) {
        console.error('User not found!');
        return;
    }
    console.log(`User ID: ${user.id}`);

    // 2. Get Workspaces
    const { data: members } = await supabase
        .from('cohost_workspace_members')
        .select('workspace_id, role, cohost_workspaces(name, slug)')
        .eq('user_id', user.id);

    console.log(`\nWorkspaces (${members?.length}):`);

    if (members) {
        for (const m of members) {
            const ws = m.cohost_workspaces;
            //@ts-ignore
            console.log(`- [${m.workspace_id}] ${ws?.name} (${ws?.slug}) - Role: ${m.role}`);

            // 3. Properties in this workspace
            const { count: propCount } = await supabase
                .from('cohost_properties')
                .select('*', { count: 'exact', head: true })
                .eq('workspace_id', m.workspace_id);

            // 4. Counts for connections
            const { data: connections } = await supabase
                .from('connections')
                .select('id')
                .eq('workspace_id', m.workspace_id);

            // 5. Review Items
            let reviewItemCount = 0;
            if (connections && connections.length > 0) {
                const connIds = connections.map(c => c.id);
                const { count } = await supabase
                    .from('enrichment_review_items')
                    .select('*', { count: 'exact', head: true })
                    .in('connection_id', connIds);
                reviewItemCount = count || 0;
            }

            console.log(`    Properties: ${propCount}`);
            console.log(`    Connections: ${connections?.length}`);
            console.log(`    Review Items: ${reviewItemCount}`);
        }
    }
}

verify();
