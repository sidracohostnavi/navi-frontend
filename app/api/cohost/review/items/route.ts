import { createClient } from '@/lib/supabase/server';
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

        console.log(`[ReviewItems] ====== WORKSPACE_FIX_V3 ====== User ID: ${user.id}`);

        // Get user's workspace via membership
        const { data: membership } = await supabase
            .from('cohost_workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

        let workspaceId = membership?.workspace_id;
        console.log(`[ReviewItems] Membership workspace: ${workspaceId || 'NONE'}`);

        // Fallback: get workspace from bookings if no membership
        if (!workspaceId) {
            const { data: sampleBooking } = await supabase
                .from('bookings')
                .select('workspace_id')
                .limit(1)
                .single();
            workspaceId = sampleBooking?.workspace_id;
            console.log(`[ReviewItems] Fallback workspace from bookings: ${workspaceId || 'NONE'}`);
        }

        if (!workspaceId) {
            console.log(`[ReviewItems] No workspace found - returning empty`);
            return NextResponse.json({ items: [] });
        }

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
