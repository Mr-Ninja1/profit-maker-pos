-- 011_under_brand_staff_login_rpc.sql
-- Staff POS login without Supabase Auth users: validate email+PIN against under_brand_staff.

BEGIN;

-- Ensure pgcrypto is available (already used elsewhere, but safe)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- SECURITY DEFINER so it can validate without exposing the table via RLS.
-- Returns 0 rows when credentials don't match.
CREATE OR REPLACE FUNCTION public.under_brand_staff_login(p_email text, p_pin text)
RETURNS TABLE (
  id uuid,
  brand_id uuid,
  name text,
  email text,
  role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.brand_id, s.name, s.email, s.role
  FROM public.under_brand_staff s
  WHERE lower(s.email) = lower(trim(COALESCE(p_email, '')))
    AND s.pin = trim(COALESCE(p_pin, ''))
    AND s.is_active = true
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.under_brand_staff_login(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.under_brand_staff_login(text, text) TO authenticated;

COMMIT;
