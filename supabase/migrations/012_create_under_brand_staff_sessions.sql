-- 012_create_under_brand_staff_sessions.sql
-- Bearer sessions for under-brand staff operators (POS) without Supabase Auth.
-- Used to securely authorize RPC calls (shifts, etc.) while keeping RLS locked down.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.under_brand_staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.under_brand_staff(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_ubs_sessions_brand_id ON public.under_brand_staff_sessions (brand_id);
CREATE INDEX IF NOT EXISTS idx_ubs_sessions_staff_id ON public.under_brand_staff_sessions (staff_id);
CREATE INDEX IF NOT EXISTS idx_ubs_sessions_expires_at ON public.under_brand_staff_sessions (expires_at);

ALTER TABLE IF EXISTS public.under_brand_staff_sessions ENABLE ROW LEVEL SECURITY;

-- No direct access for anon/authenticated; sessions are managed via SECURITY DEFINER RPC.
DROP POLICY IF EXISTS "ubs_sessions_no_select" ON public.under_brand_staff_sessions;
CREATE POLICY "ubs_sessions_no_select" ON public.under_brand_staff_sessions
  FOR SELECT
  TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "ubs_sessions_no_write" ON public.under_brand_staff_sessions;
CREATE POLICY "ubs_sessions_no_write" ON public.under_brand_staff_sessions
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
