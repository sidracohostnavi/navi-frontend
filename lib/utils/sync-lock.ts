/**
 * In-Memory Lock for Sync processes (Instance-Scoped).
 * Prevents "Double Click" race conditions on the same server instance.
 * Includes a TTL safety valve to recover from crashed/stuck locks.
 */

const LOCK_TTL_MS = 2 * 60 * 1000; // 2 minutes
const activeSyncs = new Map<string, number>(); // connectionId -> startedAt (timestamp)

export function acquireSyncLock(connectionId: string): boolean {
    const now = Date.now();
    const startedAt = activeSyncs.get(connectionId);

    if (startedAt) {
        // Check TTL (Stale Lock Recovery)
        if (now - startedAt > LOCK_TTL_MS) {
            console.warn(`[SyncLock] ⚠️ Recovering stale lock for ${connectionId} (age: ${now - startedAt}ms)`);
            // Allow re-acquire (overwrite)
        } else {
            // Locked and valid
            return false;
        }
    }

    activeSyncs.set(connectionId, now);
    return true;
}

export function releaseSyncLock(connectionId: string) {
    activeSyncs.delete(connectionId);
}
