'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';

interface UnhealthyConnection {
    id: string;
    name: string;
    gmail_status: string;
    gmail_last_error_message: string | null;
}

export default function GmailAlertBanner() {
    const [unhealthy, setUnhealthy] = useState<UnhealthyConnection[]>([]);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const checkHealth = async () => {
            try {
                const res = await fetch('/api/cohost/connections/health');
                const data = await res.json();
                if (!data.ok) {
                    setUnhealthy(data.unhealthy || []);
                    setDismissed(false); // Re-show if new issue detected
                } else {
                    setUnhealthy([]);
                }
            } catch (e) {
                // Silently fail - don't block the UI
            }
        };

        checkHealth();
        // Check every 5 minutes
        const interval = setInterval(checkHealth, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    if (dismissed || unhealthy.length === 0) return null;

    return (
        <div className="bg-red-500 text-white px-4 py-3 flex items-center justify-between fixed top-0 left-0 right-0 z-[100] shadow-md">
            <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span className="text-sm md:text-base">
                    <strong>Gmail Disconnected:</strong>{' '}
                    {unhealthy.map(c => c.name).join(', ')} — Guest names won't sync until reconnected.
                </span>
            </div>
            <div className="flex items-center gap-4 shrink-0">
                <Link
                    href="/cohost/settings/connections"
                    className="bg-white text-red-500 px-4 py-1.5 rounded-md font-medium text-sm hover:bg-red-50 transition shadow-sm"
                >
                    Reconnect
                </Link>
                <button
                    onClick={() => setDismissed(true)}
                    className="text-white/80 hover:text-white transition"
                    aria-label="Dismiss"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
}
