// app/dashboard/actions.ts
'use server'

import { createServerSupabaseClient } from '@/lib/supabase/authServer'
import { revalidatePath } from 'next/cache'

/**
 * Enable an app for a workspace
 * @param workspaceId - The workspace ID
 * @param appKey - The app key to enable ('cohost', 'momassist', 'orakl')
 * @returns Success status and error message if any
 */
export async function enableApp(workspaceId: string, appKey: string) {
    try {
        const supabase = await createServerSupabaseClient()

        // Insert or update the app status to enabled
        const { error } = await supabase
            .from('workspace_apps')
            .upsert({
                workspace_id: workspaceId,
                app_key: appKey,
                status: 'enabled',
                enabled_at: new Date().toISOString(),
            }, {
                onConflict: 'workspace_id,app_key'
            })

        if (error) {
            console.error('Error enabling app:', error)
            return { success: false, error: error.message }
        }

        // Revalidate the dashboard page to show updated state
        revalidatePath('/dashboard')

        return { success: true }
    } catch (error) {
        console.error('Failed to enable app:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}
