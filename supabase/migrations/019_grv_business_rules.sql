-- 019_grv_business_rules.sql
-- Fix GRV confirm to use Weighted Average Cost (WAC)
-- and enforce immutability for confirmed/cancelled GRVs at the DB level.

BEGIN;

CREATE OR REPLACE FUNCTION public.grv_confirm(p_grv_id uuid)
RETURNS TABLE (
  grv_id uuid,
  status text,
  confirmed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_grv public.grvs%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_grv
  FROM public.grvs g
  WHERE g.id = p_grv_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRV not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.brands b
    WHERE b.id = v_grv.brand_id AND b.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  IF v_grv.status <> 'pending' THEN
    grv_id := v_grv.id;
    status := v_grv.status;
    confirmed_at := v_grv.confirmed_at;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Allow stock mutations inside this RPC.
  PERFORM set_config('pmx.allow_stock_mutation', '1', true);

  -- Apply stock increases and update current cost using Weighted Average Cost (WAC).
  -- WAC formula: ((Current Qty * Current Cost) + (New Qty * New Cost)) / (Current Qty + New Qty)
  WITH i AS (
    SELECT gi.stock_item_id, gi.quantity, gi.unit_cost
    FROM public.grv_items gi
    WHERE gi.grv_id = v_grv.id
  )
  , upd AS (
    UPDATE public.stock_items s
    SET current_stock = COALESCE(s.current_stock, 0) + i.quantity,
        cost_per_unit = CASE
          WHEN (GREATEST(COALESCE(s.current_stock, 0), 0) + i.quantity) > 0 THEN
            (
              (GREATEST(COALESCE(s.current_stock, 0), 0) * COALESCE(s.cost_per_unit, 0))
              + (i.quantity * i.unit_cost)
            ) / (GREATEST(COALESCE(s.current_stock, 0), 0) + i.quantity)
          ELSE
            i.unit_cost
        END,
        updated_at = v_now
    FROM i
    WHERE s.id = i.stock_item_id
    RETURNING s.id
  )
  INSERT INTO public.stock_ledger(id, stock_item_id, change_amount, entry_type, reason, created_at)
  SELECT gen_random_uuid(), i.stock_item_id, i.quantity, 'RESTOCK', ('GRV ' || v_grv.grv_no), v_now
  FROM i;

  UPDATE public.grvs
  SET status = 'confirmed',
      confirmed_at = v_now,
      confirmed_by = auth.uid(),
      updated_at = v_now
  WHERE id = v_grv.id;

  grv_id := v_grv.id;
  status := 'confirmed';
  confirmed_at := v_now;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grv_confirm(uuid) TO authenticated;

-- Prevent editing/deleting a GRV once it is confirmed/cancelled.
CREATE OR REPLACE FUNCTION public.grv_prevent_locked_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'GRV is locked (%). It cannot be deleted.', OLD.status USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'GRV is locked (%). It cannot be edited.', OLD.status USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grvs_prevent_locked_mutations ON public.grvs;
CREATE TRIGGER trg_grvs_prevent_locked_mutations
BEFORE UPDATE OR DELETE ON public.grvs
FOR EACH ROW
EXECUTE FUNCTION public.grv_prevent_locked_mutations();

-- Prevent editing GRV items when the parent GRV is confirmed/cancelled.
CREATE OR REPLACE FUNCTION public.grv_items_prevent_locked_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_grv_status text;
  v_grv_id uuid;
BEGIN
  v_grv_id := COALESCE(NEW.grv_id, OLD.grv_id);

  SELECT g.status INTO v_grv_status
  FROM public.grvs g
  WHERE g.id = v_grv_id;

  -- If parent is missing (e.g. cascade delete in progress), allow.
  IF v_grv_status IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'GRV not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_grv_status <> 'pending' THEN
    RAISE EXCEPTION 'GRV items are locked because GRV is %', v_grv_status USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grv_items_prevent_locked_mutations ON public.grv_items;
CREATE TRIGGER trg_grv_items_prevent_locked_mutations
BEFORE INSERT OR UPDATE OR DELETE ON public.grv_items
FOR EACH ROW
EXECUTE FUNCTION public.grv_items_prevent_locked_mutations();

COMMIT;
