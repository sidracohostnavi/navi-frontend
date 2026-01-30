# Review System Restoration & Recovery
**Primary Owner:** Product Team

## Level 1: "It says I have a missing booking, but it's on the calendar!"
**Symptoms:** User sees a Review Item for "John Doe", but "John Doe" is clearly visible on the calendar grid.

### Diagnosis
1. **Timing:** The iCal sync might have happened *after* the email was processed. The snapshot was taken when it was missing.
2. **Action:** User clicks "Link to Existing".
   - *Logic:* System presents a list of current bookings. User selects one.
   - *Update:* Review Item `resolved`. Booking enriched with name.

## Level 2: "It ignored my booking!"
**Symptoms:** User received a reservation email, but no Review Item exists (and no booking on calendar).

### Diagnosis
1. **Parsing Failure:** The regex didn't catch "Reservation Confirmed".
   - *Fix:* Update `EmailProcessor` regex.
2. **Reprocess:** Run the "Reprocess Gmail" admin script. It will scan old messages and create the Review Item now that the regex is fixed.
