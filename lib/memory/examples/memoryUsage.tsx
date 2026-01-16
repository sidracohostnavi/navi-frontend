// lib/memory/examples/memoryUsage.tsx
/**
 * Example of how to use the memory system in a Server Component.
 * This is just for demonstration/testing purposes.
 */

import { getMemories } from '@/lib/memory/getMemories'
import { getCurrentUser } from '@/lib/supabase/authServer'
import { ensureWorkspace } from '@/lib/workspaces/ensureWorkspace'

export async function ExampleMemoryComponent() {
    const user = await getCurrentUser()
    if (!user) return null

    const workspaceId = await ensureWorkspace(user.id)
    if (!workspaceId) return null

    // 1. Fetch memories for CoHost (includes 'cohost' domain AND 'global')
    const cohostMemories = await getMemories({
        workspaceId,
        domain: 'cohost',
        limit: 10
    })

    // 2. Fetch memories for MomAssist (includes 'mom' domain AND 'global')
    // Note: CoHost memories will NOT appear here
    const momMemories = await getMemories({
        workspaceId,
        domain: 'mom',
        limit: 10
    })

    return (
        <div className="p-4 border rounded bg-gray-50">
            <h3 className="font-bold mb-2">Memory System Debug</h3>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <h4 className="font-semibold text-blue-600">CoHost Context</h4>
                    <ul className="text-sm list-disc pl-4">
                        {cohostMemories.map(m => (
                            <li key={m.id}>
                                <span className="font-mono text-xs bg-gray-200 px-1 rounded mr-1">
                                    {m.domain}
                                </span>
                                {m.content}
                            </li>
                        ))}
                        {cohostMemories.length === 0 && <li>No memories found</li>}
                    </ul>
                </div>

                <div>
                    <h4 className="font-semibold text-pink-600">MomAssist Context</h4>
                    <ul className="text-sm list-disc pl-4">
                        {momMemories.map(m => (
                            <li key={m.id}>
                                <span className="font-mono text-xs bg-gray-200 px-1 rounded mr-1">
                                    {m.domain}
                                </span>
                                {m.content}
                            </li>
                        ))}
                        {momMemories.length === 0 && <li>No memories found</li>}
                    </ul>
                </div>
            </div>
        </div>
    )
}
