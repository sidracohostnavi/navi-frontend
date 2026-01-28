import { createClient } from '@/lib/supabase/server';
import { ensureWorkspace } from '@/lib/workspaces/ensureWorkspace';
import { NextResponse } from 'next/server';

/**
 * GET /api/cohost/review/items
 * 
 * Fetch pending review items for the user's workspace.
 */
export async function GET() {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Get Single Source of Truth Workspace
        const workspaceId = await ensureWorkspace(user.id);

        if (!workspaceId) {
            console.error(`[ReviewItems] GUARDRAIL: No workspace found for user ${user.id}`);
            return NextResponse.json({ error: 'No workspace found' }, { status: 403 }); // 403 Forbidden
        }

        // 2. Strict Membership Verification (Double Check)
        // ensureWorkspace checks preference, but we want to be absolutely sure in the API boundary
        const { data: membership, error: memberError } = await supabase
            .from('cohost_workspace_members')
            .select('role')
            .eq('user_id', user.id)
            .eq('workspace_id', workspaceId)
            .single();

        if (memberError || !membership) {
            console.error(`[ReviewItems] GUARDRAIL: User ${user.id} attempting to access workspace ${workspaceId} without membership.`);
            return NextResponse.json({ error: 'Forbidden: Not a member of this workspace' }, { status: 403 });
        }

        console.log(`[ReviewItems] ACCESS GRANTED: User ${user.id} -> Workspace ${workspaceId} (${membership.role})`);

        // Debug: count all items in DB for this workspace
        const { count: totalCount } = await supabase
            .from('enrichment_review_items')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .eq('status', 'pending');

        console.log(`[ReviewItems] Workspace ${workspaceId} has ${totalCount} pending items`);

        // Fetch pending review items with correct schema
        const { data: items, error } = await supabase
            .from('enrichment_review_items')
            .select('id, workspace_id, connection_id, status, extracted_data, suggested_matches, created_at')
            .eq('workspace_id', workspaceId)
            // .eq('status', 'pending') // <--- REMOVED FILTER for debugging
            .order('created_at', { ascending: false });

        if (error) {
            console.error(`[ReviewItems] Query error:`, error);
            throw error;
        }

        console.log(`[ReviewItems] Returning ${items?.length || 0} items`);

        return NextResponse.json({ items: items || [] });

    } catch (err: any) {
        console.error('[ReviewItems] Error:', err);
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
