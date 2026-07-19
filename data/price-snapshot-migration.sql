-- =============================================================================
-- price-snapshot-migration.sql
-- -----------------------------------------------------------------------------
-- Adds two nullable columns to order_items so the price the customer committed
-- to at order placement is frozen and NEVER mutated by later product re-pricing.
--
--   basePriceSnapshot  numeric  (per-piece for unit mode; per-kg for weight)
--   offerPriceSnapshot numeric  (nullable; NULL when no offer was active)
--
-- Safe to run multiple times: uses IF NOT EXISTS and only backfills rows where
-- the snapshot is still NULL. The deployed API code has a graceful fallback
-- that catches "column does not exist" and works before OR after this runs.
-- =============================================================================

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS "basePriceSnapshot"  numeric,
  ADD COLUMN IF NOT EXISTS "offerPriceSnapshot" numeric;

-- Backfill base snapshot from the already-frozen unitPrice.
--   • Unit mode  → basePrice == unitPrice (per piece).
--   • Weight mode → basePrice per kg == unitPrice / (weightKg). If the branch
--     already amended the weight we prefer originalWeightGrams (the CS-entered
--     weight the customer originally saw), else weightGrams.
--
-- offerPriceSnapshot is intentionally left NULL for legacy rows — we cannot
-- recover whether the original unitPrice was base or offer. Going forward the
-- API POST/PUT will populate both correctly.

UPDATE public.order_items oi
SET "basePriceSnapshot" = ROUND(oi."unitPrice"::numeric, 2)
FROM public.products p
WHERE oi."productId" = p.id
  AND oi."basePriceSnapshot" IS NULL
  AND (p."pricingMode" IS NULL OR p."pricingMode" = 'unit')
  AND oi."unitPrice" IS NOT NULL;

UPDATE public.order_items oi
SET "basePriceSnapshot" = ROUND(
  (oi."unitPrice"::numeric / NULLIF(
     COALESCE(oi."originalWeightGrams", NULLIF(oi."weightGrams", 0)),
     0
   ) * 1000.0)::numeric,
  2
)
FROM public.products p
WHERE oi."productId" = p.id
  AND oi."basePriceSnapshot" IS NULL
  AND p."pricingMode" = 'weight'
  AND oi."unitPrice" IS NOT NULL
  AND COALESCE(oi."originalWeightGrams", oi."weightGrams") > 0;
