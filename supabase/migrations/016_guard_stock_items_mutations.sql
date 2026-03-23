-- 016_guard_stock_items_mutations.sql
-- Enforce: stock quantity/cost changes must happen via authorized DB operations (RPCs).
-- This supports auditability: increases via GRV confirm, decreases via POS/production RPCs.

BEGIN;

-- Prevent direct updates to stock quantities/costs unless explicitly allowed.
CREATE OR REPLACE FUNCTION public.guard_stock_items_mutations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.current_stock IS DISTINCT FROM OLD.current_stock)
     OR (NEW.cost_per_unit IS DISTINCT FROM OLD.cost_per_unit) THEN
    IF COALESCE(current_setting('pmx.allow_stock_mutation', true), '') <> '1' THEN
      RAISE EXCEPTION 'Direct stock mutations are disabled. Use GRV / POS / Production operations.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_stock_items_mutations ON public.stock_items;
CREATE TRIGGER trg_guard_stock_items_mutations
BEFORE UPDATE ON public.stock_items
FOR EACH ROW
EXECUTE FUNCTION public.guard_stock_items_mutations();

-- Update stock deduction RPC to be compatible with the guard.
CREATE OR REPLACE FUNCTION public.handle_stock_deductions(p_deductions json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  res json;
  insuff_count int;
BEGIN
  -- Allow stock mutations inside this RPC.
  PERFORM set_config('pmx.allow_stock_mutation', '1', true);

  WITH ded AS (
    SELECT
      COALESCE(NULLIF(trim(both from (d->>'itemId')), ''), NULLIF(trim(both from (d->>'stock_item_id')), ''))::uuid AS item_id,
      (d->>'qty')::numeric AS qty
    FROM json_array_elements(p_deductions) AS d
  ),
  locked AS (
    SELECT
      s.id,
      s.current_stock,
      s.cost_per_unit,
      d.qty AS eff_qty
    FROM ded d
    JOIN public.stock_items s ON s.id = d.item_id
    FOR UPDATE
  ),
  insufficient AS (
    SELECT id AS item_id, eff_qty AS required_qty, current_stock AS on_hand_qty FROM locked WHERE current_stock < eff_qty
  )
  SELECT count(*), json_agg(json_build_object('itemId', item_id::text, 'requiredQty', required_qty, 'onHandQty', on_hand_qty))
  INTO insuff_count, res
  FROM insufficient;

  IF insuff_count > 0 THEN
    RETURN json_build_object('ok', false, 'insufficient', COALESCE(res, '[]'::json));
  END IF;

  WITH ded2 AS (
    SELECT
      COALESCE(NULLIF(trim(both from (d->>'itemId')), ''), NULLIF(trim(both from (d->>'stock_item_id')), ''))::uuid AS item_id,
      (d->>'qty')::numeric AS qty
    FROM json_array_elements(p_deductions) AS d
  ), updated AS (
    UPDATE public.stock_items s
    SET current_stock = s.current_stock - d.qty
    FROM ded2 d
    WHERE s.id = d.item_id
    RETURNING s.id, s.current_stock, d.qty AS eff_qty
  ), ledger AS (
    INSERT INTO public.stock_ledger(id, stock_item_id, change_amount, entry_type, reason, created_at)
    SELECT gen_random_uuid(), id, -eff_qty, 'SALE', 'auto deduction', now() FROM updated
    RETURNING stock_item_id
  )
  SELECT json_build_object(
    'ok', true,
    'results', json_agg(
      json_build_object(
        'itemId', u.id::text,
        'before', (u.current_stock + u.eff_qty)::numeric,
        'after', u.current_stock,
        'unitCost', COALESCE(NULLIF(u.eff_qty,0),0)
      )
    )
  )
  INTO res
  FROM updated u;

  RETURN COALESCE(res, json_build_object('ok', true, 'results', '[]'::json));
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_stock_deductions(json) TO anon;
GRANT EXECUTE ON FUNCTION public.handle_stock_deductions(json) TO authenticated;

-- Update production batch deduction RPC to be compatible with the guard.
CREATE OR REPLACE FUNCTION public.apply_recipe_batch_deduction(p_manufacturing_recipe_id uuid, p_production_qty numeric)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  res json;
  insuff_count int;
BEGIN
  -- Allow stock mutations inside this RPC.
  PERFORM set_config('pmx.allow_stock_mutation', '1', true);

  WITH mri AS (
    SELECT stock_item_id, quantity_used, unit FROM public.manufacturing_recipe_ingredients WHERE manufacturing_recipe_id = p_manufacturing_recipe_id
  ), joined AS (
    SELECT
      m.stock_item_id,
      SUM((
        CASE
          WHEN LOWER(TRIM(COALESCE(m.unit, ''))) = 'g' AND LOWER(TRIM(COALESCE(s.unit, ''))) = 'kg' THEN (m.quantity_used / 1000.0)
          WHEN LOWER(TRIM(COALESCE(m.unit, ''))) = 'ml' AND LOWER(TRIM(COALESCE(s.unit, ''))) IN ('l','ltr','ltrs') THEN (m.quantity_used / 1000.0)
          ELSE m.quantity_used
        END
      ) * p_production_qty::numeric) AS eff_qty,
      s.current_stock
    FROM mri m
    JOIN public.stock_items s ON s.id = m.stock_item_id
    GROUP BY m.stock_item_id, s.current_stock
  ), locked AS (
    SELECT j.stock_item_id AS id, j.current_stock, j.eff_qty
    FROM joined j
    JOIN public.stock_items s ON s.id = j.stock_item_id
    FOR UPDATE
  ), insufficient AS (
    SELECT id AS item_id, eff_qty AS required_qty, current_stock AS on_hand_qty FROM locked WHERE current_stock < eff_qty
  )
  SELECT count(*) INTO insuff_count FROM insufficient;

  IF insuff_count > 0 THEN
    SELECT json_agg(json_build_object('itemId', item_id::text, 'requiredQty', required_qty, 'onHandQty', on_hand_qty)) INTO res FROM insufficient;
    RETURN json_build_object('ok', false, 'insufficient', COALESCE(res, '[]'::json));
  END IF;

  WITH updated AS (
    UPDATE public.stock_items s
    SET current_stock = s.current_stock - l.eff_qty
    FROM locked l
    WHERE s.id = l.id
    RETURNING s.id, s.current_stock, l.eff_qty
  ), ledger AS (
    INSERT INTO public.stock_ledger(id, stock_item_id, change_amount, entry_type, reason, created_at)
    SELECT gen_random_uuid(), id, -eff_qty, 'PRODUCTION', 'batch deduction', now() FROM updated
    RETURNING stock_item_id
  )
  SELECT json_build_object(
    'ok', true,
    'results', json_agg(
      json_build_object(
        'itemId', u.id::text,
        'before', (u.current_stock + u.eff_qty)::numeric,
        'after', u.current_stock,
        'deducted', u.eff_qty
      )
    )
  )
  INTO res
  FROM updated u;

  RETURN COALESCE(res, json_build_object('ok', true, 'results', '[]'::json));
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_recipe_batch_deduction(uuid, numeric) TO anon;
GRANT EXECUTE ON FUNCTION public.apply_recipe_batch_deduction(uuid, numeric) TO authenticated;

COMMIT;
