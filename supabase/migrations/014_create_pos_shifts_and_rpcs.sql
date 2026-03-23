-- 014_create_pos_shifts_and_rpcs.sql
-- Persist POS cashier shifts (opening/closing balances) for auditing.
-- Access is via SECURITY DEFINER RPC for under-brand staff sessions; admins can read via RLS.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.pos_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.under_brand_staff(id) ON DELETE RESTRICT,
  staff_name text NOT NULL,

  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,

  opening_cash numeric(18,2) NOT NULL DEFAULT 0,
  closing_cash numeric(18,2) NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_shifts_brand_id ON public.pos_shifts (brand_id);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_staff_id ON public.pos_shifts (staff_id);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_started_at ON public.pos_shifts (started_at desc);

-- Only one active shift per staff per brand
CREATE UNIQUE INDEX IF NOT EXISTS uidx_pos_shifts_active_per_staff
  ON public.pos_shifts (brand_id, staff_id)
  WHERE ended_at IS NULL;

-- Keep updated_at current
DROP TRIGGER IF EXISTS set_updated_at_pos_shifts_trigger ON public.pos_shifts;
CREATE TRIGGER set_updated_at_pos_shifts_trigger
BEFORE UPDATE ON public.pos_shifts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE IF EXISTS public.pos_shifts ENABLE ROW LEVEL SECURITY;

-- Admin/read access: any authenticated user whose staff row is linked to this brand.
DROP POLICY IF EXISTS "pos_shifts_read_brand_staff" ON public.pos_shifts;
CREATE POLICY "pos_shifts_read_brand_staff" ON public.pos_shifts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff st
      WHERE st.user_id = auth.uid()
        AND st.brand_id = brand_id
        AND st.is_active = true
    )
  );

-- No direct writes from clients; shifts are written via RPC
DROP POLICY IF EXISTS "pos_shifts_no_write" ON public.pos_shifts;
CREATE POLICY "pos_shifts_no_write" ON public.pos_shifts
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Internal helper: validate bearer session token
CREATE OR REPLACE FUNCTION public._ubs_validate_session(p_session_token text)
RETURNS TABLE (
  session_id uuid,
  brand_id uuid,
  staff_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_hash text;
BEGIN
  v_hash := encode(digest(trim(COALESCE(p_session_token, '')), 'sha256'), 'hex');

  RETURN QUERY
  SELECT s.id, s.brand_id, s.staff_id
  FROM public.under_brand_staff_sessions s
  WHERE s.token_hash = v_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
  LIMIT 1;

  -- Touch last_used_at best-effort (won't error if no row)
  UPDATE public.under_brand_staff_sessions
  SET last_used_at = now()
  WHERE token_hash = v_hash;
END;
$$;

REVOKE ALL ON FUNCTION public._ubs_validate_session(text) FROM PUBLIC;

-- Get active shift for the logged-in staff session (0 or 1 rows)
CREATE OR REPLACE FUNCTION public.pos_shift_get_active(p_session_token text)
RETURNS TABLE (
  id uuid,
  brand_id uuid,
  staff_id uuid,
  staff_name text,
  started_at timestamptz,
  opening_cash numeric(18,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_brand uuid;
  v_staff uuid;
BEGIN
  SELECT vs.brand_id, vs.staff_id INTO v_brand, v_staff
  FROM public._ubs_validate_session(p_session_token) vs
  LIMIT 1;

  IF v_staff IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT sh.id, sh.brand_id, sh.staff_id, sh.staff_name, sh.started_at, sh.opening_cash
  FROM public.pos_shifts sh
  WHERE sh.brand_id = v_brand
    AND sh.staff_id = v_staff
    AND sh.ended_at IS NULL
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_shift_get_active(text) TO anon;
GRANT EXECUTE ON FUNCTION public.pos_shift_get_active(text) TO authenticated;

-- Start a shift (opening cash). Returns the active shift.
CREATE OR REPLACE FUNCTION public.pos_shift_start(p_session_token text, p_opening_cash numeric)
RETURNS TABLE (
  id uuid,
  brand_id uuid,
  staff_id uuid,
  staff_name text,
  started_at timestamptz,
  opening_cash numeric(18,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_brand uuid;
  v_staff uuid;
  v_name text;
  v_role text;
BEGIN
  SELECT vs.brand_id, vs.staff_id INTO v_brand, v_staff
  FROM public._ubs_validate_session(p_session_token) vs
  LIMIT 1;

  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'Invalid session';
  END IF;

  SELECT s.name, s.role INTO v_name, v_role
  FROM public.under_brand_staff s
  WHERE s.id = v_staff
    AND s.brand_id = v_brand
    AND s.is_active = true
  LIMIT 1;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Staff not active';
  END IF;

  IF v_role IS DISTINCT FROM 'cashier' THEN
    RAISE EXCEPTION 'Only cashiers can start shifts';
  END IF;

  INSERT INTO public.pos_shifts (brand_id, staff_id, staff_name, opening_cash)
  VALUES (v_brand, v_staff, v_name, GREATEST(0, COALESCE(p_opening_cash, 0)))
  ON CONFLICT (brand_id, staff_id) WHERE ended_at IS NULL DO NOTHING;

  RETURN QUERY
  SELECT sh.id, sh.brand_id, sh.staff_id, sh.staff_name, sh.started_at, sh.opening_cash
  FROM public.pos_shifts sh
  WHERE sh.brand_id = v_brand
    AND sh.staff_id = v_staff
    AND sh.ended_at IS NULL
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_shift_start(text, numeric) TO anon;
GRANT EXECUTE ON FUNCTION public.pos_shift_start(text, numeric) TO authenticated;

-- End the active shift (closing cash). Returns the closed shift.
CREATE OR REPLACE FUNCTION public.pos_shift_end_active(p_session_token text, p_closing_cash numeric)
RETURNS TABLE (
  id uuid,
  brand_id uuid,
  staff_id uuid,
  staff_name text,
  started_at timestamptz,
  ended_at timestamptz,
  opening_cash numeric(18,2),
  closing_cash numeric(18,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_brand uuid;
  v_staff uuid;
  v_closed public.pos_shifts%ROWTYPE;
BEGIN
  SELECT vs.brand_id, vs.staff_id INTO v_brand, v_staff
  FROM public._ubs_validate_session(p_session_token) vs
  LIMIT 1;

  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'Invalid session';
  END IF;

  UPDATE public.pos_shifts sh
  SET ended_at = now(),
      closing_cash = GREATEST(0, COALESCE(p_closing_cash, 0))
  WHERE sh.brand_id = v_brand
    AND sh.staff_id = v_staff
    AND sh.ended_at IS NULL
  RETURNING sh.* INTO v_closed;

  IF v_closed.id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v_closed.id, v_closed.brand_id, v_closed.staff_id, v_closed.staff_name, v_closed.started_at, v_closed.ended_at,
         v_closed.opening_cash, v_closed.closing_cash;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_shift_end_active(text, numeric) TO anon;
GRANT EXECUTE ON FUNCTION public.pos_shift_end_active(text, numeric) TO authenticated;

COMMIT;
