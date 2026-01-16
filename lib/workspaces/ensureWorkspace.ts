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
    const supabase = await createServerSupabaseClient()

    // First, try to get existing workspace
    const { data: existingMember, error: memberError } = await supabase
        .from('cohost_workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .single()

    if (existingMember && !memberError) {
        return existingMember.workspace_id
    }

    // No workspace found, create one
    // We need service role to bypass RLS for workspace creation
    const serviceClient = createCohostServiceClient()

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

    return workspace.id
}
