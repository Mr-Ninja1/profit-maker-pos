-- 021_grv_force_delete_dev.sql
-- DEV-ONLY escape hatch: allow force deleting GRVs (including confirmed/cancelled)
-- to declutter dev environments.
--
-- NOTE:
-- - This deletes GRV headers + items.
-- - It does NOT roll back stock quantities/costs or ledger entries.
--   (Rolling back WAC safely is not reversible without additional history.)

BEGIN;

-- Allow triggers to be bypassed when a privileged RPC explicitly enables it.
CREATE OR REPLACE FUNCTION public.grv_prevent_locked_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Allow an explicit force-delete override (dev/admin tooling).
  IF COALESCE(current_setting('pmx.allow_grv_force_delete', true), '') = '1' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

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
  -- Allow an explicit force-delete override (dev/admin tooling).
  IF COALESCE(current_setting('pmx.allow_grv_force_delete', true), '') = '1' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

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

-- Force-delete RPC.
CREATE OR REPLACE FUNCTION public.grv_force_delete(p_grv_id uuid)
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
    RAISE EXCEPTION 'GRV not found' USING ERRCODE = 'P0002';
  END IF;

  -- Brand owner only.
  IF NOT EXISTS (
    SELECT 1 FROM public.brands b
    WHERE b.id = v_grv.brand_id AND b.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  -- Explicitly bypass immutability triggers for this session.
  PERFORM set_config('pmx.allow_grv_force_delete', '1', true);

  DELETE FROM public.grv_items WHERE grv_id = v_grv.id;
  DELETE FROM public.grvs WHERE id = v_grv.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grv_force_delete(uuid) TO authenticated;

COMMIT;
