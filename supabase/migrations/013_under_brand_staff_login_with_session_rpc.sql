-- 013_under_brand_staff_login_with_session_rpc.sql
-- Staff POS login without Supabase Auth users: validate email+PIN against under_brand_staff
-- and issue a bearer session token for subsequent RPC calls.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.under_brand_staff_login_with_session(p_email text, p_pin text)
RETURNS TABLE (
  id uuid,
  brand_id uuid,
  name text,
  email text,
  role text,
  session_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_staff_id uuid;
  v_brand_id uuid;
  v_name text;
  v_email text;
  v_role text;
  v_token text;
  v_hash text;
BEGIN
  SELECT s.id, s.brand_id, s.name, s.email, s.role
  INTO v_staff_id, v_brand_id, v_name, v_email, v_role
  FROM public.under_brand_staff s
  WHERE lower(s.email) = lower(trim(COALESCE(p_email, '')))
    AND s.pin = trim(COALESCE(p_pin, ''))
    AND s.is_active = true
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN;
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.under_brand_staff_sessions (brand_id, staff_id, token_hash, expires_at)
  VALUES (v_brand_id, v_staff_id, v_hash, now() + interval '30 days');

  RETURN QUERY
  SELECT v_staff_id, v_brand_id, v_name, v_email, v_role, v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.under_brand_staff_login_with_session(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.under_brand_staff_login_with_session(text, text) TO authenticated;

COMMIT;
