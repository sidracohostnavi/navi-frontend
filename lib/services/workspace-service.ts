// lib/services/workspace-service.ts
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

/**
 * Ensures that a workspace exists for the given user. 
 * If none exists, creates one idempotently safely avoiding duplicates.
 */
export async function ensureWorkspaceExists(
  userId: string, 
  userEmail?: string | null
): Promise<{ workspaceId: string | null, isNew: boolean, error?: any }> {
  try {
    const adminClient = createCohostServiceClient();

    // SAFETY CHECK 1: Does user already own a workspace?
    const { data: existingOwnership, error: ownerError } = await adminClient
      .from('cohost_workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();

    if (ownerError && ownerError.code !== 'PGRST116') {
      console.error('[workspace-service] Error checking existing ownership:', ownerError);
      return { workspaceId: null, isNew: false, error: ownerError };
    }

    if (existingOwnership) {
      return { workspaceId: existingOwnership.workspace_id, isNew: false };
    }

    // SAFETY CHECK 2: Double-check no workspace with this creator exists
    const { data: existingWorkspace, error: wsSearchError } = await adminClient
      .from('cohost_workspaces')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)
      .maybeSingle();

    if (wsSearchError && wsSearchError.code !== 'PGRST116') {
      console.error('[workspace-service] Error checking existing workspace:', wsSearchError);
      return { workspaceId: null, isNew: false, error: wsSearchError };
    }

    if (existingWorkspace) {
      // Just add them as a member to fix the orphan workspace
      await adminClient.from('cohost_workspace_members').upsert({
         workspace_id: existingWorkspace.id,
         user_id: userId,
         role: 'owner',
      });
      return { workspaceId: existingWorkspace.id, isNew: false };
    }

    // Create workspace with transaction-like safety
    const workspaceName = userEmail
      ? `${userEmail.split('@')[0]}'s Properties`
      : 'My Properties';

    // Step 1: Create workspace
    const { data: newWorkspace, error: wsError } = await adminClient
      .from('cohost_workspaces')
      .insert({
        name: workspaceName,
        slug: `ws-${userId}`,
        owner_id: userId,
      })
      .select('id')
      .single();

    if (wsError || !newWorkspace) {
      console.error('[workspace-service] Failed to create workspace:', wsError);
      return { workspaceId: null, isNew: false, error: wsError };
    }

    const newWorkspaceId = newWorkspace.id;

    // Step 2: Add user as owner
    const { error: memberError } = await adminClient
      .from('cohost_workspace_members')
      .insert({
        workspace_id: newWorkspaceId,
        user_id: userId,
        role: 'owner',
      });

    if (memberError) {
      console.error('[workspace-service] Failed to add workspace member:', memberError);
      // Rollback: delete the orphaned workspace
      await adminClient
        .from('cohost_workspaces')
        .delete()
        .eq('id', newWorkspaceId);
      return { workspaceId: null, isNew: false, error: memberError };
    }

    // Step 3: Create default automation settings
    const { error: settingsError } = await adminClient
      .from('cohost_automation_settings')
      .insert({
        workspace_id: newWorkspaceId,
        automation_level: 1, 
      });

    if (settingsError) {
      console.error('[workspace-service] Failed to create automation settings:', settingsError);
    } // non-fatal

    return { workspaceId: newWorkspaceId, isNew: true };

  } catch (err) {
    console.error('[workspace-service] Exception ensuring workspace exists:', err);
    return { workspaceId: null, isNew: false, error: err };
  }
}
