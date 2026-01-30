# Connections Restoration & Recovery
**Primary Owner:** Engineering Team

## Level 1: "Disconnected" State
**Symptoms:** Connection shows as "Disconnected" (Red).

### Diagnosis
1. **Token Expired/Revoked:** User changed Gmail password or revoked access in Google Security settings.
2. **Action:** Click "Reconnect" in the UI. This triggers the OAuth flow again to get a fresh token.

## Level 2: "Label Not Found"
**Symptoms:** Logs show `404 Label Not Found` or ingestion yields 0 emails despite visible emails in Gmail.

### Diagnosis
1. **Label Renamed:** Did the user rename "Airbnb" to "Airbnb Old"?
2. **Action:** Update the `reservation_label` in Connection Settings to match the exact Gmail string.

## Level 3: Stuck Ingestion
**Symptoms:** New emails are arriving in Gmail but not appearing in Navi.

### Diagnosis
1. **Oauth Scope:** Did we request the correct scope? (`gmail.readonly`)
2. **Filter Logic:** Is the Subject line different? (e.g. Airbnb changed subject from "Reservation Confirmed" to "You have a booking").
   - *Fix:* This requires a code update to `EmailProcessor` regex logic. (See `lib/services/email-processor.ts`).

## Level 4: Duplicate Connection Conflict
**Symptoms:** Error "Label Conflict" or "Cross Connection Message Seen".

### Diagnosis
- Two connections in the same workspace try to use the same Label.
- **Fix:** Delete the redundant connection. Ensure 1:1 mapping between Gmail Account+Label and Connection.
