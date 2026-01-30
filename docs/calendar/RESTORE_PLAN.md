# Calendar Restoration & Recovery Plan
**Primary Owner:** Engineering Team

This document outlines procedures for recovering from sync failures, data corruption, or "missing booking" incidents.

## Level 1: Individual Feed Failure
**Symptoms:** "Sync Error" in settings, red status dot, missing bookings from one channel.

### Diagnosis
1. Go to **Settings > Calendar Sync**.
2. Expand **Diagnostics** on the failing feed.
3. Check `last_http_status` and `last_error`.

### Recovery Steps
1. **Verify Source:** Open the iCal URL in a private browser window. Does it download?
   - *If No:* The issue is with the external platform (e.g. Airbnb link expired). **Action:** User must generate a new link in Airbnb and update CoHost.
   - *If Yes:* Proceed to step 2.
2. **Manual Trigger:** Click the "Sync" button in the UI. Watch for toast errors.
3. **Reset Feed:**
   - Delete the feed.
   - Re-add the feed with the same URL.
   - Triggers a fresh "Zero-State" import.

## Level 2: Property-Wide Data Mismatch
**Symptoms:** Calendar shows "Blocked" where it should be free, or free where it should be booked.

### Recovery Steps
1. **Nuclear Option (Per Property):**
   - We do not currently have a "Clear All Bookings" button in UI.
   - **SQL Intervention:**
     ```sql
     DELETE FROM bookings WHERE property_id = '<PROPERTY_ID>' AND source_type != 'direct';
     ```
   - Go to UI and click **Sync Now**.
   - This effectively performs a hard reset.

## Level 3: Enrichment Failure (Guest Names Missing)
**Symptoms:** Bookings appearing as "Reserved" or "Airbnb User" despite having Gmail access.

### Diagnosis
- Check `gmail_messages` table to ensure emails are arriving.
- Check `reservation_facts` to ensure parsing is working.

### Recovery Steps
1. Ensure the Gmail Connection is active.
2. If `reservation_facts` exists but booking is not enriched:
   - The sync might have run *before* the email arrived.
   - **Action:** Click **Sync Now** on the calendar. This re-runs the matching logic.

## Level 4: Disaster Recovery (Total System Failure)
**Symptoms:** Infinite loaders, 500 errors on calendar page.

### Automatic Failsafes
- The frontend `fetchInitialData` wraps everything in try/catch.
- If Supabase is down, it shows an empty grid rather than crashing.

### Manual Restore
1. Revert recent code deployments.
2. Check Supabase logs for RLS violations (common cause of "empty grid").
3. Verify `ICalProcessor` isn't timing out (Vercel function limits).
