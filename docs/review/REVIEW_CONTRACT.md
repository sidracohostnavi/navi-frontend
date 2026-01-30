# Review Inbox Contract
**Status:** Immutable
**Last Updated:** January 28, 2026

## 1. No Automatic Writes
- **Rule:** The Review system is READ-ONLY regarding the `bookings` table.
- **Constraint:** The detection logic detects discrepancy, but NEVER "fixes" it automatically by inserting a booking.
- **Reason:** Preventing "Phantom Bookings". An email might be a "Inquiry" or "Request to Book" mis-parsed as "Confirmed". Only iCal (or Human) allows a blocked date.

## 2. Retention
- **Rule:** We keep Review Items until explicitly resolved.
- **Constraint:** Items do not expire.
- **Status:** `pending` | `resolved` | `ignored`.

## 3. Data Lineage
- **Rule:** Every Review Item must point back to its source.
- **Constraint:** `gmail_message_id` implies we can always show the user the *original email* that triggered this alert.
- **UI:** The User must be able to click "View Email" to verify the reality of the booking.
