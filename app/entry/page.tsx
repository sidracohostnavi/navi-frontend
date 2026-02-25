// app/entry/page.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/authServer'
import { ensureWorkspace } from '@/lib/workspaces/ensureWorkspace'
import { getWorkspaceApps } from '@/lib/apps/getWorkspaceApps'

export default async function EntryPage() {
    // Check authentication
    const user = await getCurrentUser()

    if (!user) {
        redirect('/auth/login')
    }

    // Get or create user's workspace
    const workspaceId = await ensureWorkspace(user.id)

    if (!workspaceId) {
        // User has no workspace — redirect to CoHost marketing page
        redirect('/cohost');
    }

    // Get enabled apps for this workspace
    const enabledApps = await getWorkspaceApps(workspaceId)

    // Redirect based on enabled apps count
    if (enabledApps.length === 1) {
        redirect(`/${enabledApps[0]}`)
    } else {
        redirect('/dashboard')
    }
}
