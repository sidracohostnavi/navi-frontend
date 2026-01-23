-- Migration 033: Add Booking Enrichment Fields
-- Adds columns needed for detailed matching and enrichment status

ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS guest_first_name TEXT,
ADD COLUMN IF NOT EXISTS guest_last_initial TEXT,
ADD COLUMN IF NOT EXISTS reservation_code TEXT, -- Distinct from external_uid in some cases, or enriched version
ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS date_discrepancy BOOLEAN DEFAULT FALSE;

-- Index for faster matching if needed (though usually we match by property_id + dates)
CREATE INDEX IF NOT EXISTS idx_bookings_reservation_code ON bookings(reservation_code);
