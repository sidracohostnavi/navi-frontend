-- Add extra_guest_fee_frequency column to cohost_properties
ALTER TABLE cohost_properties ADD COLUMN IF NOT EXISTS extra_guest_fee_frequency TEXT DEFAULT 'nightly';
