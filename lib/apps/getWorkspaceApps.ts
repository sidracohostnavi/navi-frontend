// lib/apps/getWorkspaceApps.ts
// Helper to fetch enabled apps for a workspace

import { createServerSupabaseClient } from '@/lib/supabase/authServer'

export interface WorkspaceApp {
    id: string
    workspace_id: string
    app_key: string
    status: 'enabled' | 'trial' | 'disabled'
    enabled_at: string
    onboarded_at: string | null
    created_at: string
    updated_at: string
}

/**
 * Get all enabled apps for a workspace
 * @param workspaceId - The workspace ID to query
 * @returns Array of enabled app keys (e.g., ['cohost', 'momassist'])
 */
export async function getWorkspaceApps(workspaceId: string): Promise<string[]> {
    try {
        const supabase = await createServerSupabaseClient()

        const { data, error } = await supabase
            .from('workspace_apps')
            .select('app_key')
            .eq('workspace_id', workspaceId)
            .eq('status', 'enabled')
            .order('app_key')

        if (error) {
            console.error('Error fetching workspace apps:', error)
            return []
        }

        return data?.map(app => app.app_key) || []
    } catch (error) {
        console.error('Failed to fetch workspace apps:', error)
        return []
    }
}

/**
 * Get all apps for a workspace (including disabled/trial)
 * @param workspaceId - The workspace ID to query
 * @returns Array of workspace apps with full details
 */
export async function getAllWorkspaceApps(workspaceId: string): Promise<WorkspaceApp[]> {
    try {
        const supabase = await createServerSupabaseClient()

        const { data, error } = await supabase
            .from('workspace_apps')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('app_key')

        if (error) {
            console.error('Error fetching all workspace apps:', error)
            return []
        }

        return data || []
    } catch (error) {
        console.error('Failed to fetch all workspace apps:', error)
        return []
    }
}

/**
 * Check if a specific app is enabled for a workspace
 * @param workspaceId - The workspace ID to check
 * @param appKey - The app key to check (e.g., 'cohost')
 * @returns True if the app is enabled, false otherwise
 */
export async function isAppEnabled(workspaceId: string, appKey: string): Promise<boolean> {
    try {
        const supabase = await createServerSupabaseClient()

        const { data, error } = await supabase
            .from('workspace_apps')
            .select('status')
            .eq('workspace_id', workspaceId)
            .eq('app_key', appKey)
            .single()

        if (error || !data) {
            return false
        }

        return data.status === 'enabled'
    } catch (error) {
        return false
    }
}
