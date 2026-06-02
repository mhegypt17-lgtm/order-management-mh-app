-- Targeted products feature (focus list for agents). Safe to run multiple times.
-- All existing products default to NOT targeted (غير مستهدف).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS "isTargeted" boolean NOT NULL DEFAULT false;

-- Backfill in case the column already existed with NULLs.
UPDATE products SET "isTargeted" = false WHERE "isTargeted" IS NULL;

-- Partial index speeds up the "show only targeted" filter on large catalogs.
CREATE INDEX IF NOT EXISTS products_is_targeted_idx
  ON products ("isTargeted")
  WHERE "isTargeted" = true;

-- Reload PostgREST schema cache so the column appears in supabase-js immediately.
NOTIFY pgrst, 'reload schema';
