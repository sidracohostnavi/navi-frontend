
-- 1. Relax connections status constraint
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_gmail_status_check;
ALTER TABLE connections ADD CONSTRAINT connections_gmail_status_check 
    CHECK (gmail_status IN ('connected', 'disconnected', 'ignored') OR gmail_status IS NULL);

-- 2. Ensure reservation_facts idempotency on source message
-- We want one fact row per email message per connection.
DROP INDEX IF EXISTS idx_reservation_facts_source; -- Remove old if any
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_facts_connection_msg 
    ON reservation_facts (connection_id, source_gmail_message_id);

-- 3. Optional partial index for confirmation code lookups (speed)
CREATE INDEX IF NOT EXISTS idx_reservation_facts_conf_code 
    ON reservation_facts (connection_id, confirmation_code) 
    WHERE confirmation_code IS NOT NULL;
