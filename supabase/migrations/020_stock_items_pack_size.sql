-- 020_stock_items_pack_size.sql
-- Persist pack conversion metadata for stock_items so PACK can be represented correctly.

BEGIN;

ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS items_per_pack numeric(12,2);

-- Optional constraint: if set, it must be positive.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stock_items_items_per_pack_positive'
  ) THEN
    ALTER TABLE public.stock_items
      ADD CONSTRAINT stock_items_items_per_pack_positive
      CHECK (items_per_pack IS NULL OR items_per_pack > 0);
  END IF;
END $$;

COMMIT;
