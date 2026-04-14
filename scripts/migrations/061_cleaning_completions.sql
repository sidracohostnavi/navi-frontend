BEGIN;

-- Records when a cleaner marks a booking's cleaning as done.
-- Cleanings are derived live from bookings (not stored) — this table only
-- captures completions so they persist across page loads and show on host view.
CREATE TABLE IF NOT EXISTS public.cleaning_completions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  workspace_id          UUID NOT NULL REFERENCES public.cohost_workspaces(id) ON DELETE CASCADE,
  completed_by_user_id  UUID NOT NULL REFERENCES auth.users(id),
  completed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id) -- one completion record per booking
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

COMMIT;

NOTIFY pgrst, 'reload schema';
