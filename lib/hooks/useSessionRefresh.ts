// lib/hooks/useSessionRefresh.ts
// Custom hook to refresh Supabase session when a tab regains focus.
// Prevents stale sessions in background tabs from breaking API calls.

'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useSessionRefresh() {
    useEffect(() => {
        const supabase = createClient();

        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible') {
                try {
                    await supabase.auth.getSession();
                } catch (e) {
                    console.error('[SessionRefresh] Failed to refresh session:', e);
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);
}
