// lib/apps/checkAppAccess.ts
// Helper to check if user has access to a specific app

import { ensureWorkspace } from '@/lib/workspaces/ensureWorkspace'
import { isAppEnabled } from '@/lib/apps/getWorkspaceApps'

export interface AppAccessResult {
    hasAccess: boolean
    redirectUrl?: string
}

/**
 * Check if a user has access to a specific app
 * @param userId - The user's ID
 * @param appKey - The app key to check ('cohost', 'momassist', 'orakl')
 * @returns Access result with redirect URL if access denied
 */
export async function checkAppAccess(
    userId: string,
    appKey: string
): Promise<AppAccessResult> {
    try {
        // Get or create user's workspace
        const workspaceId = await ensureWorkspace(userId)

        if (!workspaceId) {
            return {
                hasAccess: false,
                redirectUrl: '/cohost',
            }
        }

        // Check if app is enabled for this workspace
        const enabled = await isAppEnabled(workspaceId, appKey)

        if (!enabled) {
            return {
                hasAccess: false,
                redirectUrl: `/dashboard?enable=${appKey}`,
            }
        }

        return { hasAccess: true }
    } catch (error) {
        console.error('Error checking app access:', error)
        return {
            hasAccess: false,
            redirectUrl: '/dashboard',
        }
    }
}
