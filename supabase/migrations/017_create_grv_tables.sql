-- 017_create_grv_tables.sql
-- Database-backed Purchases (GRV) with brand scoping.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Counter per brand for human-readable GRV numbers.
CREATE TABLE IF NOT EXISTS public.grv_counters (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  last_no bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.next_grv_no(p_brand_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_no bigint;
BEGIN
  INSERT INTO public.grv_counters (brand_id, last_no)
  VALUES (p_brand_id, 1)
  ON CONFLICT (brand_id)
  DO UPDATE SET last_no = public.grv_counters.last_no + 1, updated_at = now()
  RETURNING last_no INTO v_no;

  RETURN 'GRV-' || lpad(v_no::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_grv_no(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.grvs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,

  grv_no text NOT NULL,
  date date NOT NULL DEFAULT current_date,

  supplier_id uuid NULL,
  supplier_name text NOT NULL DEFAULT '',

  payment_type text NOT NULL CHECK (payment_type IN ('cash', 'account', 'cheque')),
  apply_vat boolean NOT NULL DEFAULT true,
  vat_rate numeric(5,4) NOT NULL DEFAULT 0.16,

  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,

  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  received_by text NOT NULL DEFAULT '',

  created_by uuid NULL,
  confirmed_at timestamptz NULL,
  confirmed_by uuid NULL,
  cancelled_at timestamptz NULL,
  cancelled_by uuid NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uidx_grvs_brand_grv_no UNIQUE (brand_id, grv_no)
);

-- Auto-set GRV number + created_by.
CREATE OR REPLACE FUNCTION public.grvs_set_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.grv_no IS NULL OR btrim(NEW.grv_no) = '' THEN
    NEW.grv_no := public.next_grv_no(NEW.brand_id);
  END IF;

  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grvs_set_defaults ON public.grvs;
CREATE TRIGGER trg_grvs_set_defaults
BEFORE INSERT ON public.grvs
FOR EACH ROW
EXECUTE FUNCTION public.grvs_set_defaults();

DROP TRIGGER IF EXISTS set_updated_at_grvs_trigger ON public.grvs;
CREATE TRIGGER set_updated_at_grvs_trigger
BEFORE UPDATE ON public.grvs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_grvs_brand_date ON public.grvs (brand_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_grvs_brand_status ON public.grvs (brand_id, status);

CREATE TABLE IF NOT EXISTS public.grv_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grv_id uuid NOT NULL REFERENCES public.grvs(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,

  item_code text NOT NULL DEFAULT '',
  item_name text NOT NULL DEFAULT '',

  quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uidx_grv_items_grv_stock UNIQUE (grv_id, stock_item_id)
);

DROP TRIGGER IF EXISTS set_updated_at_grv_items_trigger ON public.grv_items;
CREATE TRIGGER set_updated_at_grv_items_trigger
BEFORE UPDATE ON public.grv_items
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_grv_items_grv_id ON public.grv_items (grv_id);

-- RLS (brand owner only)
ALTER TABLE IF EXISTS public.grvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.grv_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grvs_select_brand_owner" ON public.grvs;
CREATE POLICY "grvs_select_brand_owner" ON public.grvs
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.brands b
    WHERE b.id = brand_id AND b.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "grvs_insert_brand_owner" ON public.grvs;
CREATE POLICY "grvs_insert_brand_owner" ON public.grvs
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.brands b
    WHERE b.id = brand_id AND b.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "grvs_update_brand_owner" ON public.grvs;
CREATE POLICY "grvs_update_brand_owner" ON public.grvs
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

DROP POLICY IF EXISTS "grvs_delete_brand_owner" ON public.grvs;
CREATE POLICY "grvs_delete_brand_owner" ON public.grvs
  FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.brands b
    WHERE b.id = brand_id AND b.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "grv_items_select_brand_owner" ON public.grv_items;
CREATE POLICY "grv_items_select_brand_owner" ON public.grv_items
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.grvs g
    JOIN public.brands b ON b.id = g.brand_id
    WHERE g.id = grv_id
      AND b.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "grv_items_insert_brand_owner" ON public.grv_items;
CREATE POLICY "grv_items_insert_brand_owner" ON public.grv_items
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.grvs g
    JOIN public.brands b ON b.id = g.brand_id
    WHERE g.id = grv_id
      AND b.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "grv_items_update_brand_owner" ON public.grv_items;
CREATE POLICY "grv_items_update_brand_owner" ON public.grv_items
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.grvs g
    JOIN public.brands b ON b.id = g.brand_id
    WHERE g.id = grv_id
      AND b.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.grvs g
    JOIN public.brands b ON b.id = g.brand_id
    WHERE g.id = grv_id
      AND b.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "grv_items_delete_brand_owner" ON public.grv_items;
CREATE POLICY "grv_items_delete_brand_owner" ON public.grv_items
  FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.grvs g
    JOIN public.brands b ON b.id = g.brand_id
    WHERE g.id = grv_id
      AND b.owner_id = auth.uid()
  ));

COMMIT;
