-- 010_create_under_brand_staff_table.sql
-- Create under_brand_staff table for brand-scoped staff login (PIN + roles)

BEGIN;

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared helper used across tables
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.under_brand_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  pin text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lookup + uniqueness helpers
CREATE INDEX IF NOT EXISTS idx_ubs_brand_id ON public.under_brand_staff USING btree (brand_id);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_ubs_brand_email ON public.under_brand_staff (brand_id, lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS uidx_ubs_brand_pin ON public.under_brand_staff (brand_id, pin);

-- Keep updated_at current
DROP TRIGGER IF EXISTS set_updated_at_ubs_trigger ON public.under_brand_staff;
CREATE TRIGGER set_updated_at_ubs_trigger
BEFORE UPDATE ON public.under_brand_staff
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- RLS: brand owners can manage staff under their brand
ALTER TABLE IF EXISTS public.under_brand_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "under_brand_staff_select_brand_owner" ON public.under_brand_staff;
CREATE POLICY "under_brand_staff_select_brand_owner" ON public.under_brand_staff
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.brands b
    WHERE b.id = brand_id AND b.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "under_brand_staff_insert_brand_owner" ON public.under_brand_staff;
CREATE POLICY "under_brand_staff_insert_brand_owner" ON public.under_brand_staff
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.brands b
    WHERE b.id = brand_id AND b.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "under_brand_staff_update_brand_owner" ON public.under_brand_staff;
CREATE POLICY "under_brand_staff_update_brand_owner" ON public.under_brand_staff
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.brands b
    WHERE b.id = brand_id AND b.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.brands b
    WHERE b.id = brand_id AND b.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "under_brand_staff_delete_brand_owner" ON public.under_brand_staff;
CREATE POLICY "under_brand_staff_delete_brand_owner" ON public.under_brand_staff
  FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.brands b
    WHERE b.id = brand_id AND b.owner_id = auth.uid()
  ));

COMMIT;