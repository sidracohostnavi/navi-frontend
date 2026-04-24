-- Migration 066: Fix booking exclusion constraint to honour cancelled status
-- Problem: no_overlapping_active_bookings used WHERE (is_active = true) only.
-- A cancelled booking left with is_active=true (e.g. cancelled via Supabase dashboard
-- or any path other than /api/cohost/bookings/[id]/cancel) would still block iCal
-- and direct bookings from being inserted for the same dates.
--
-- Fix has two parts:
--   1. Data: set is_active=false on any booking where status='cancelled' but is_active=true
--   2. Constraint: recreate the exclusion with status != 'cancelled' in the WHERE clause
--      so the constraint is resilient to future data inconsistency from any source.

-- Step 1: Correct existing data
UPDATE bookings
SET is_active = false
WHERE status = 'cancelled'
  AND is_active = true;

-- Step 2: Drop the existing constraint
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_overlapping_active_bookings;

-- Step 3: Recreate with both guards
--   is_active = true  → skip soft-deleted rows
--   status != 'cancelled' → skip cancelled rows even if is_active was not flipped
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings ADD CONSTRAINT no_overlapping_active_bookings
  EXCLUDE USING gist (
    property_id WITH =,
    daterange(
      (check_in  AT TIME ZONE 'UTC')::date,
      (check_out AT TIME ZONE 'UTC')::date,
      '[)'
    ) WITH &&
  )
  WHERE (is_active = true AND status != 'cancelled');
