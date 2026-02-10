-- Migration: Add manual resolution columns to bookings
-- Human-in-the-loop override for unenriched bookings

-- Manual connection assignment (for label + color)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS manual_connection_id UUID REFERENCES connections(id) ON DELETE SET NULL;

-- Manual guest info override
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS manual_guest_name TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS manual_guest_count INT;

-- Internal notes
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS manual_notes TEXT;

-- Timestamp when manually resolved (NULL = not resolved)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS manually_resolved_at TIMESTAMPTZ;

-- Index for efficient resolution status queries
CREATE INDEX IF NOT EXISTS idx_bookings_manual_resolution ON bookings(manually_resolved_at) WHERE manually_resolved_at IS NOT NULL;
