// lib/workspaces/ensureWorkspace.ts
// Utility to guarantee every authenticated user has a workspace and membership

import { createServerSupabaseClient } from '@/lib/supabase/authServer'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'

/**
 * Ensures a user has a workspace and membership.
 * If the user already has a workspace, returns the workspace_id.
 * If not, creates a new workspace and membership with role='owner'.
 * 
 * @param userId - The authenticated user's ID
 * @returns workspace_id or null if creation failed
 */
export async function ensureWorkspace(userId: string): Promise<string | null> {
    console.log(`[ensureWorkspace] ====== GUARDRAILS_V1 ====== userId: ${userId}`);
    const supabase = await createServerSupabaseClient()
    const serviceClient = createCohostServiceClient()

    // 1. Check User Preference (Single Source of Truth)
    const { data: pref } = await supabase
        .from('cohost_user_preferences')
        .select('workspace_id')
        .eq('user_id', userId)
        .single();

    if (pref?.workspace_id) {
        // Verify membership for this preferred workspace
        const { data: member } = await supabase
            .from('cohost_workspace_members')
            .select('workspace_id')
            .eq('user_id', userId)
            .eq('workspace_id', pref.workspace_id)
            .single();

        if (member) {
            console.log(`[ensureWorkspace] Verified preference: ${pref.workspace_id}`);
            return pref.workspace_id;
        } else {
            console.warn(`[ensureWorkspace] Preference ${pref.workspace_id} invalid (no membership). tailored fallback.`);
        }
    }

    // 2. Fallback: Find ANY valid membership
    const { data: existingMember, error: memberError } = await supabase
        .from('cohost_workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()

    if (existingMember && !memberError) {
        console.log(`[ensureWorkspace] Fallback found: ${existingMember.workspace_id}. Locking preference.`);

        // LOCK IT: Upsert preference so next time we hit step 1
        await serviceClient
            .from('cohost_user_preferences')
            .upsert({
                user_id: userId,
                workspace_id: existingMember.workspace_id,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

        return existingMember.workspace_id
    }

    // 3. Create New Workspace
    console.log(`[ensureWorkspace] NO EXISTING WORKSPACE - WILL CREATE NEW ONE`);

    // Get user email for workspace name
    const { data: { user } } = await supabase.auth.getUser()
    const email = user?.email || 'User'

    // Create workspace
    const { data: workspace, error: wsError } = await serviceClient
        .from('cohost_workspaces')
        .insert({
            name: `${email}'s Workspace`,
        })
        .select('id')
        .single()

    if (wsError || !workspace) {
        console.error('Failed to create workspace:', wsError)
        return null
    }

    // Add user as workspace owner
    const { error: addMemberError } = await serviceClient
        .from('cohost_workspace_members')
        .insert({
            workspace_id: workspace.id,
            user_id: userId,
            role: 'owner',
        })

    if (addMemberError) {
        console.error('Failed to add workspace member:', addMemberError)
        return null
    }

    // Create default automation settings
    await serviceClient
        .from('cohost_automation_settings')
        .insert({
            workspace_id: workspace.id,
            automation_level: 1,
        })

    // LOCK IT: Set preference
    await serviceClient
        .from('cohost_user_preferences')
        .upsert({
            user_id: userId,
            workspace_id: workspace.id,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

    return workspace.id
}

/**
 * Explicitly sets the active workspace for a user.
 * Call this when the user switches workspaces in the UI.
 */
export async function setActiveWorkspace(userId: string, workspaceId: string): Promise<boolean> {
    const serviceClient = createCohostServiceClient();

    // Verify membership first
    const { data: member } = await serviceClient
        .from('cohost_workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .single();

    if (!member) {
        console.error(`[setActiveWorkspace] User ${userId} is not a member of ${workspaceId}`);
        return false;
    }

    const { error } = await serviceClient
        .from('cohost_user_preferences')
        .upsert({
            user_id: userId,
            workspace_id: workspaceId,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

    if (error) {
        console.error('[setActiveWorkspace] Failed to update preference:', error);
        return false;
    }

    return true;
}
