BEGIN;

CREATE TABLE IF NOT EXISTS public.host_profiles (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES public.cohost_workspaces(id) ON DELETE CASCADE,
  first_name      TEXT,
  last_name       TEXT,
  business_name   TEXT,
  phone           TEXT,
  logo_url        TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_host_profiles_workspace ON public.host_profiles(workspace_id);

ALTER TABLE public.host_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'host_profiles'
      AND policyname = 'Users can manage their own profile'
  ) THEN
    CREATE POLICY "Users can manage their own profile"
      ON public.host_profiles
      FOR ALL
      USING (user_id = auth.uid());
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
