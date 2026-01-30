# Properties Restoration & Recovery
**Primary Owner:** Product/Support

## Level 1: Property Not Visible
**Symptoms:** User says "I added a property but I don't see it".

### Diagnosis
1. **Workspace Check:** Is the user looking at the correct Workspace?
   - *Fix:* Switch workspace in the top-left dropdown.
2. **RLS Policy:** Did the user get added to the workspace `members` table?
   - If not, they have 0 visibility.
   - *Action:* Admin must re-invite or add them.

## Level 2: Accidental Deletion
**Symptoms:** "I deleted my property by mistake! All bookings are gone!"

### Recovery
1. **Soft Delete check:** Currently, we DO NOT have soft-delete. **Deletion is permanent.**
2. **Backup Restore:**
   - Requires Engineering intervention.
   - Restore `cohost_properties` row from Point-in-Time Recovery (PITR).
   - Restore associated `bookings` and `ical_feeds`.
   - *Severity:* High. Data loss is real.

## Level 3: Corrupt Settings
**Symptoms:** "I can't save my Wifi password".

### Diagnosis
- Check if `property_settings` row exists.
- If we use a separate table, sometimes the row isn't created on property creation.
- *Fix:* Manually insert a row into `property_settings` for that ID.
