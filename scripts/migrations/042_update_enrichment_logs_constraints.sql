-- Migration: Update enrichment_logs constraints
-- Adds 'refresh' to run_type and 'started' to status

BEGIN;

-- Drop existing check constraints if they exist
ALTER TABLE enrichment_logs DROP CONSTRAINT IF EXISTS enrichment_logs_run_type_check;
ALTER TABLE enrichment_logs DROP CONSTRAINT IF EXISTS enrichment_logs_status_check;

-- Add updated constraints
ALTER TABLE enrichment_logs 
    ADD CONSTRAINT enrichment_logs_run_type_check 
    CHECK (run_type IN ('manual', 'scheduled', 'refresh'));

ALTER TABLE enrichment_logs 
    ADD CONSTRAINT enrichment_logs_status_check 
    CHECK (status IN ('success', 'error', 'partial', 'started', 'no_results'));

COMMIT;
