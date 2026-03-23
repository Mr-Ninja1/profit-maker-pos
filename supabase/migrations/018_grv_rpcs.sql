-- 018_grv_rpcs.sql
-- GRV business operations: confirm (applies stock restock + ledger), cancel, delete.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

  -- Apply stock increases and update current cost.
  WITH i AS (
    SELECT gi.stock_item_id, gi.quantity, gi.unit_cost
    FROM public.grv_items gi
    WHERE gi.grv_id = v_grv.id
  ), upd AS (
    UPDATE public.stock_items s
    SET current_stock = s.current_stock + i.quantity,
        cost_per_unit = i.unit_cost,
        updated_at = now()
    FROM i
    WHERE s.id = i.stock_item_id
    RETURNING s.id
  )
  INSERT INTO public.stock_ledger(id, stock_item_id, change_amount, entry_type, reason, created_at)
  SELECT gen_random_uuid(), i.stock_item_id, i.quantity, 'RESTOCK', ('GRV ' || v_grv.grv_no), now()
  FROM i;

  UPDATE public.grvs
  SET status = 'confirmed',
      confirmed_at = now(),
      confirmed_by = auth.uid(),
      updated_at = now()
  WHERE id = v_grv.id;

  grv_id := v_grv.id;
  status := 'confirmed';
  confirmed_at := now();
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grv_confirm(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.grv_cancel(p_grv_id uuid)
RETURNS TABLE (
  grv_id uuid,
  status text,
  cancelled_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_grv public.grvs%ROWTYPE;
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
    cancelled_at := v_grv.cancelled_at;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.grvs
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      updated_at = now()
  WHERE id = v_grv.id;

  grv_id := v_grv.id;
  status := 'cancelled';
  cancelled_at := now();
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grv_cancel(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.grv_delete_pending(p_grv_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_grv public.grvs%ROWTYPE;
BEGIN
  SELECT * INTO v_grv
  FROM public.grvs g
  WHERE g.id = p_grv_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.brands b
    WHERE b.id = v_grv.brand_id AND b.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  IF v_grv.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending GRVs can be deleted' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.grvs WHERE id = v_grv.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grv_delete_pending(uuid) TO authenticated;

COMMIT;
