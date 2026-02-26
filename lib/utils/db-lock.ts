import { createClient } from '@supabase/supabase-js';

export class DBLock {
    private acquired: boolean = false;
    private connectionId: string;

    constructor() {
        this.connectionId = 'cron-refresh-lock';
    }

    async acquire(): Promise<boolean> {
        try {
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );

            // Check if a cron job ran and succeeded within the last 60 seconds
            const { data, error } = await supabase
                .from('ical_sync_log')
                .select('synced_at')
                .order('synced_at', { ascending: false })
                .limit(1)
                .single();

            if (data && data.synced_at) {
                const lastSync = new Date(data.synced_at).getTime();
                const now = Date.now();
                if (now - lastSync < 60000) {
                    console.log('[DBLock] Soft lock engaged: Another sync ran within 60s.');
                    return false;
                }
            }
            this.acquired = true;
            return true;
        } catch (e) {
            console.error('[DBLock] Error in soft lock:', e);
            // Default to allow if check fails to prevent permanent cron death
            this.acquired = true;
            return true;
        }
    }

    async release(): Promise<void> {
        // Soft lock releases naturally via time buffer
        this.acquired = false;
    }
}
