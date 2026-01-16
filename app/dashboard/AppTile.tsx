// app/dashboard/AppTile.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { enableApp } from './actions'

interface AppTileProps {
    app: {
        key: string
        name: string
        description: string
        icon: string
    }
    workspaceId: string
    status: 'enabled' | 'trial' | 'disabled' | null
    isHighlighted?: boolean
}

export default function AppTile({ app, workspaceId, status, isHighlighted }: AppTileProps) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const isEnabled = status === 'enabled'

    const handleEnable = async () => {
        setLoading(true)
        setError(null)

        const result = await enableApp(workspaceId, app.key)

        if (result.success) {
            // Redirect to the app
            router.push(`/${app.key}`)
        } else {
            setError(result.error || 'Failed to enable app')
            setLoading(false)
        }
    }

    const handleOpen = () => {
        router.push(`/${app.key}`)
    }

    return (
        <div
            className={`
        bg-white rounded-lg shadow-sm p-6 border-2 transition-all
        ${isHighlighted ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'}
        ${isEnabled ? 'hover:border-blue-300' : 'hover:border-gray-300'}
      `}
        >
            {/* App Icon & Name */}
            <div className="flex items-center gap-3 mb-3">
                <div className="text-4xl">{app.icon}</div>
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">{app.name}</h3>
                    {status && (
                        <span className={`
              text-xs px-2 py-0.5 rounded-full
              ${status === 'enabled' ? 'bg-green-100 text-green-700' : ''}
              ${status === 'trial' ? 'bg-yellow-100 text-yellow-700' : ''}
              ${status === 'disabled' ? 'bg-gray-100 text-gray-700' : ''}
            `}>
                            {status}
                        </span>
                    )}
                </div>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-600 mb-4">{app.description}</p>

            {/* Error Message */}
            {error && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                    {error}
                </div>
            )}

            {/* Action Button */}
            {isEnabled ? (
                <button
                    onClick={handleOpen}
                    className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                    Open
                </button>
            ) : (
                <button
                    onClick={handleEnable}
                    disabled={loading}
                    className="w-full py-2 px-4 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {loading ? 'Enabling...' : 'Enable'}
                </button>
            )}

            {/* Highlight Indicator */}
            {isHighlighted && (
                <p className="text-xs text-blue-600 mt-2 text-center">
                    ✨ Recommended for you
                </p>
            )}
        </div>
    )
}
