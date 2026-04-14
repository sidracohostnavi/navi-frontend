BEGIN;

CREATE TABLE IF NOT EXISTS public.team_pay_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.cohost_workspaces(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hourly_rate     NUMERIC(8,2) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES auth.users(id),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_pay_rates_workspace ON public.team_pay_rates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_team_pay_rates_user ON public.team_pay_rates(user_id);

ALTER TABLE public.team_pay_rates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'team_pay_rates'
      AND policyname = 'Workspace owners and admins can manage pay rates'
  ) THEN
    CREATE POLICY "Workspace owners and admins can manage pay rates"
      ON public.team_pay_rates
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.cohost_workspace_members m
          WHERE m.workspace_id = team_pay_rates.workspace_id
            AND m.user_id = auth.uid()
            AND m.role IN ('owner', 'admin')
            AND m.is_active = true
        )
      );
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
