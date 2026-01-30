import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
    // 1. Find user with most review items
    const { data: items } = await supabase.from('enrichment_review_items').select('connection_id');

    if (!items || items.length === 0) {
        console.log('No review items found in DB. Trying properties...');
        // Fallback to properties
        const { data: props } = await supabase.from('cohost_properties').select('workspace_id');
        if (!props || props.length === 0) {
            console.error('No properties or review items found!');
            return;
        }
        // ... logic to find via property ...
    }

    // Since review items link to connection -> workspace -> member -> user
    // Let's just find the workspace with the most items
    const { data: connections } = await supabase.from('connections').select('id, workspace_id');
    const connMap = new Map(connections?.map(c => [c.id, c.workspace_id]));

    const wsCounts: Record<string, number> = {};
    if (items) {
        items.forEach(item => {
            const wsId = connMap.get(item.connection_id);
            if (wsId) wsCounts[wsId] = (wsCounts[wsId] || 0) + 1;
        });
    }

    let targetWsId = Object.keys(wsCounts).sort((a, b) => wsCounts[b] - wsCounts[a])[0];

    // If no review items, find workspace with most properties
    if (!targetWsId) {
        const { data: props } = await supabase.from('cohost_properties').select('workspace_id');
        const pCounts: Record<string, number> = {};
        props?.forEach(p => pCounts[p.workspace_id] = (pCounts[p.workspace_id] || 0) + 1);
        targetWsId = Object.keys(pCounts).sort((a, b) => pCounts[b] - pCounts[a])[0];
    }

    console.log('Target Workspace:', targetWsId);

    // Get a member
    const { data: members } = await supabase.from('cohost_workspace_members').select('user_id').eq('workspace_id', targetWsId).limit(1);

    if (!members || members.length === 0) {
        console.error('No members found for workspace');
        return;
    }

    const userId = members[0].user_id;

    // Get Email
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);
    console.log(`Generating link for ${user?.email} (${userId})...`);

    // Generate Link
    const { data, error } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: user?.email!,
        options: {
            redirectTo: 'http://localhost:3000/cohost/dashboard'
        }
    });

    if (error) console.error('Error:', error);
    else {
        // HACK: The generated link usually points to the site URL configured in Supabase.
        // We need to make sure it points to localhost:3000 for the browser agent.
        // It returns data.properties.action_link
        let link = data.properties?.action_link;
        if (link) {
            // Replace origin with localhost:3000 if needed (it might be distinct)
            // Usually it preserves the redirectTo.
            console.log('\nMAGIC_LINK:', link);
        } else {
            console.log('No link returned', data);
        }
    }
}

run();
