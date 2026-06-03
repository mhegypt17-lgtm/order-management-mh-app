-- Adds a multi-product link to complaints so we can report top products with issues.
-- Run once against Supabase. Safe to re-run.

ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS "productIds" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Optional index for future "complaints by product" lookups
CREATE INDEX IF NOT EXISTS complaints_product_ids_gin
  ON complaints USING gin ("productIds");
