BEGIN;

-- Create cleaning_completions if it doesn't exist yet (idempotent with 061).
CREATE TABLE IF NOT EXISTS public.cleaning_completions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  workspace_id          UUID NOT NULL REFERENCES public.cohost_workspaces(id) ON DELETE CASCADE,
  completed_by_user_id  UUID NOT NULL REFERENCES auth.users(id),
  completed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_cleaning_completions_workspace ON public.cleaning_completions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_completions_booking  ON public.cleaning_completions(booking_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_completions_month    ON public.cleaning_completions(workspace_id, completed_at);

ALTER TABLE public.cleaning_completions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cleaning_completions' AND policyname = 'Workspace members can manage cleaning completions'
  ) THEN
    CREATE POLICY "Workspace members can manage cleaning completions"
      ON public.cleaning_completions
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.cohost_workspace_members m
          WHERE m.workspace_id = cleaning_completions.workspace_id
            AND m.user_id = auth.uid()
            AND m.is_active = true
        )
      );
  END IF;
END $$;

-- Add payment tracking fields.
-- payment_status NULL            = completed but no hours submitted yet
-- payment_status 'pending_payment' = hours submitted, awaiting host payment
-- payment_status 'paid'          = host has marked as paid

ALTER TABLE public.cleaning_completions
  ADD COLUMN IF NOT EXISTS hours_worked              NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS calculated_amount_owed    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS extra_expense_amount      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS extra_expense_description TEXT,
  ADD COLUMN IF NOT EXISTS completion_note           TEXT,
  ADD COLUMN IF NOT EXISTS payment_status            TEXT
    CHECK (payment_status IN ('pending_payment', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_at                   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by_user_id           UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_cleaning_completions_payment
  ON public.cleaning_completions(workspace_id, payment_status)
  WHERE payment_status IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
