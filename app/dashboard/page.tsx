// app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/authServer'
import { ensureWorkspace } from '@/lib/workspaces/ensureWorkspace'
import { getAllWorkspaceApps } from '@/lib/apps/getWorkspaceApps'
import AppTile from './AppTile'

// App metadata
const APPS = [
    {
        key: 'cohost',
        name: 'CoHost',
        description: 'Guest messaging automation',
        icon: '🏠',
    },
    {
        key: 'momassist',
        name: 'MomAssist',
        description: 'Parenting assistant',
        icon: '👶',
    },
    {
        key: 'orakl',
        name: 'Orakl',
        description: 'AI oracle assistant',
        icon: '🔮',
    },
] as const

export default async function DashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ enable?: string }>
}) {
    // Await searchParams (Next.js 15 requirement)
    const params = await searchParams

    // Require authentication
    const user = await getCurrentUser()

    if (!user) {
        redirect('/auth/login')
    }

    // Get or create workspace
    const workspaceId = await ensureWorkspace(user.id)

    if (!workspaceId) {
        redirect('/auth/login?error=workspace_setup_failed')
    }

    // Fetch all workspace apps (enabled, trial, disabled)
    const workspaceApps = await getAllWorkspaceApps(workspaceId)

    // Create a map of app statuses
    const appStatusMap = new Map(
        workspaceApps.map(app => [app.app_key, app.status])
    )

    // Get highlight from query param
    const highlightApp = params.enable

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">
                        Welcome to Naviverse
                    </h1>
                    <p className="text-gray-600 mt-2">
                        Manage your apps and workspaces
                    </p>
                    <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm text-blue-800">
                            <strong>Logged in as:</strong> {user.email}
                        </p>
                    </div>
                </div>

                {/* Apps Grid */}
                <div className="mb-8">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">
                        Your Apps
                    </h2>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {APPS.map(app => (
                            <AppTile
                                key={app.key}
                                app={app}
                                workspaceId={workspaceId}
                                status={appStatusMap.get(app.key) || null}
                                isHighlighted={highlightApp === app.key}
                            />
                        ))}
                    </div>
                </div>

                {/* Info Section */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Getting Started
                    </h3>
                    <ul className="space-y-2 text-sm text-gray-600">
                        <li>• Click <strong>Enable</strong> to activate an app for your workspace</li>
                        <li>• Click <strong>Open</strong> to access an enabled app</li>
                        <li>• Manage your workspace settings and team members (coming soon)</li>
                    </ul>
                </div>
            </div>
        </div>
    )
}
