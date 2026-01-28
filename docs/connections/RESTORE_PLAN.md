# Connections Restore Plan

**Description:** Recovery procedures for the Connections system in case of critical failure, data corruption, or broken integration.
**Emergency Contact:** Engineering Lead (Sidra)

## 1. When to Use This Plan
Execute this plan if any of the following symptoms occur:
*   **System-Wide Integration Failure:** All Gmail connections return `Unauthorized` or `invalid_grant` simultaneously.
*   **Data Corruption:** `bookings` table guest names are being overwritten with incorrect or garbage data.
*   **Infinite Loops:** Sync jobs are acquiring locks but never releasing them, causing `SYNC_IN_PROGRESS` deadlocks.
*   **Security Breach:** Suspected cross-workspace data leakage (seeing messages from User A in User B's account).

## 2. Immediate Safe Checks

Before rolling back code, verify the current state:

### A. Database Integrity Check
Run this SQL in Supabase SQL Editor to check for recent anomalies:
```sql
-- Check for orphan messages or weird counts
SELECT connection_id, COUNT(*) 
FROM gmail_messages 
WHERE created_at > NOW() - INTERVAL '1 hour' 
GROUP BY connection_id;
```

### B. UI/API Check
1.  Go to **CoHost Settings > Connections**.
2.  Can you load the page? (If 500 Error -> Frontend/API break).
3.  Click "Edit" on a connection. Can you see the "Gmail Label" field?
4.  Check browser console for 403/401 errors.

## 3. Rollback Ladder (Least to Most Destructive)

### Level 1: Revert Code (Frontend/API)
If the issue is logic-based (e.g., regex parsing bug, UI broken):
1.  Identify the last stable commit hash.
2.  Run:
    ```bash
    git revert HEAD  # Reverts the very last commit
    # OR
    git checkout <last_stable_hash> . # Reverts working directory to specific state
    ```
3.  Deploy/Push immediately.

### Level 2: Disable Sync Jobs
If the issue is bad data ingestion (Email Processor writing bad data):
1.  **Emergency Stop:**
    (If using Cron jobs): Pause the Vercel Cron or GitHub Action.
    (If manual/API trigged):
    Block the API route temporarily by adding an early return in `app/api/cohost/connections/[id]/sync/route.ts`:
    ```typescript
    export async function POST(req) {
       return NextResponse.json({ error: 'Sync temporarily disabled' }, { status: 503 });
    }
    ```

### Level 3: Database Revert (Migrations)
**WARNING: Destructive to new data.** Only use if schema changes broke the app (e.g., migration 041_email_processing or newer).
1.  Identify the bad migration file (e.g., `supabase/migrations/20260127000000_bad_migration.sql`).
2.  Run the **Down Migration** (if defined) or manually revert schema:
    ```bash
    supabase db reset # DESTRUCTIVE - Resets local DB to seed
    # OR for Production:
    # Use the dashboard to manually DROP specific columns/tables added.
    ```
    *   *Example Revert SQL:*
        ```sql
        DROP TABLE IF EXISTS gmail_messages; 
        -- Re-run previous known good schema if needed.
        ```

## 4. Smoke Tests (Post-Restore)
After performing any recovery, you **MUST** pass these checks:

1.  **Create Connection:**
    *   Add a test connection (Platform: Airbnb, Label: "Test").
2.  **Auth:**
    *   Click "Connect".
    *   Complete Google OAuth flow.
    *   Status should be GREEN (`Connected`).
3.  **Sync Data:**
    *   Click "Sync Now".
    *   Check logs: `[EmailProcessor] Processing X messages`.
    *   Verify data: `SELECT count(*) FROM gmail_messages WHERE connection_id = '...'`.

## 5. Stop Conditions
**PAUSE** restoration efforts if:
1.  You are deleting user data (`bookings` table rows) without a backup.
2.  The error persists even after reverting code (indicates external API change from Google or corrupted tokens).
3.  You cannot identify the root cause (random blindly reverting is dangerous).
