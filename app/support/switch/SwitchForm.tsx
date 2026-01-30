'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SwitchForm() {
    const [workspaceId, setWorkspaceId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/support/switch-workspace', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workspace_id: workspaceId }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to switch');
            }

            // Refresh to update UI and server state
            router.refresh();
            // Redirect to dashboard
            window.location.href = '/cohost/dashboard';

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium mb-1">Target Workspace ID</label>
                <input
                    type="text"
                    value={workspaceId}
                    onChange={(e) => setWorkspaceId(e.target.value)}
                    placeholder="e.g. 1188717b-..."
                    className="w-full border rounded p-2 text-black"
                    required
                />
            </div>

            {error && (
                <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
                {loading ? 'Switching...' : 'Switch Workspace'}
            </button>

            <div className="pt-4 border-t">
                <button
                    type="button"
                    onClick={async () => {
                        if (!confirm('Exit support mode?')) return;
                        setLoading(true);
                        try {
                            await fetch('/api/support/clear-workspace', { method: 'POST' });
                            window.location.href = '/cohost/dashboard';
                        } catch (e) {
                            console.error(e);
                            alert('Failed to reset');
                            setLoading(false);
                        }
                    }}
                    className="w-full bg-red-100 text-red-700 p-2 rounded hover:bg-red-200"
                >
                    Reset Support Mode (Exit)
                </button>
            </div>
        </form>
    );
}
