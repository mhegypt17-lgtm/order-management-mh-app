-- ============================================================
-- price-snapshot-migration.sql
--
-- Purpose: Freeze the product price at the moment an order line is
-- created, so that later product-price edits don't rewrite the price
-- displayed on already-placed orders.
--
-- Adds two nullable columns to `order_items`:
--   basePriceSnapshot   — product.basePrice at time of order (per-unit for
--                          unit items, per-kg for weight items)
--   offerPriceSnapshot  — product.offerPrice at time of order, or NULL if
--                          there was no promo when the line was created
--
-- Backfills existing rows so historical orders keep behaving:
--   • unit-mode lines  → basePrice = unitPrice
--   • weight-mode lines → basePrice = unitPrice / (kg), using the CS-entered
--                          weight where available (originalWeightGrams) so
--                          we don't divide by a branch-adjusted weight.
--   offerPriceSnapshot stays NULL for backfilled rows — we don't know the
--   original base/offer split, so the "promo" column simply hides for those.
--
-- Safe to run multiple times.
-- ============================================================

alter table public.order_items
  add column if not exists "basePriceSnapshot"  numeric,
  add column if not exists "offerPriceSnapshot" numeric;

-- Backfill unit-mode rows (weightGrams null / 0): base = unitPrice.
update public.order_items oi
   set "basePriceSnapshot" = oi."unitPrice"
  from public.products p
 where oi."productId" = p.id
   and oi."basePriceSnapshot" is null
   and coalesce(p."pricingMode", 'unit') <> 'weight'
   and oi."unitPrice" is not null;

-- Backfill weight-mode rows: base(perKg) = unitPrice / kg.
-- Prefer originalWeightGrams (CS-entered) over weightGrams (branch may have
-- adjusted it). If neither is > 0, leave the snapshot NULL and skip — those
-- rows will fall back to displaying just `unitPrice` at runtime.
update public.order_items oi
   set "basePriceSnapshot" = round(
         (oi."unitPrice" / (coalesce(oi."originalWeightGrams", oi."weightGrams") / 1000.0))::numeric,
         2
       )
  from public.products p
 where oi."productId" = p.id
   and oi."basePriceSnapshot" is null
   and coalesce(p."pricingMode", 'unit') = 'weight'
   and oi."unitPrice" is not null
   and coalesce(oi."originalWeightGrams", oi."weightGrams") > 0;
