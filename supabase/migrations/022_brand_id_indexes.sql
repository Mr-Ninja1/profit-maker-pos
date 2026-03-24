-- 022_brand_id_indexes.sql
-- Performance: add brand_id indexes for common brand-scoped queries.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.stock_items') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS stock_items_brand_id_idx ON public.stock_items(brand_id)';
  END IF;

  IF to_regclass('public.suppliers') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS suppliers_brand_id_idx ON public.suppliers(brand_id)';
  END IF;

  IF to_regclass('public.departments') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS departments_brand_id_idx ON public.departments(brand_id)';
  END IF;

  IF to_regclass('public.products') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS products_brand_id_idx ON public.products(brand_id)';
  END IF;

  IF to_regclass('public.manufacturing_recipes') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS manufacturing_recipes_brand_id_idx ON public.manufacturing_recipes(brand_id)';
  END IF;

  IF to_regclass('public.pos_orders') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS pos_orders_brand_id_idx ON public.pos_orders(brand_id)';
  END IF;

  IF to_regclass('public.pos_order_items') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS pos_order_items_brand_id_idx ON public.pos_order_items(brand_id)';
  END IF;

  IF to_regclass('public.grvs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS grvs_brand_id_idx ON public.grvs(brand_id)';
  END IF;

  IF to_regclass('public.grv_items') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS grv_items_grv_id_idx ON public.grv_items(grv_id)';
  END IF;
END $$;

COMMIT;
