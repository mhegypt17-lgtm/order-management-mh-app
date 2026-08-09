-- Custom (catalog-less) order items + B2B negotiated/manual discount.
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS guards throughout).

-- 1. Allow order_items rows with no catalog product (custom one-off items).
alter table public.order_items
  alter column "productId" drop not null;

alter table public.order_items
  add column if not exists "isCustomItem" boolean default false,
  add column if not exists "customItemName" text,
  add column if not exists "priceAdjustmentPct" numeric,
  add column if not exists "priceAdjustmentReason" text;

-- 2. B2B negotiated/manual discount on the order (stacks on top of any
--    promo/voucher discountCode — stored separately so existing
--    discountCode/discountAmount reporting is unaffected).
alter table public.orders
  add column if not exists "manualDiscountType" text,
  add column if not exists "manualDiscountValue" numeric,
  add column if not exists "manualDiscountAmount" numeric,
  add column if not exists "manualDiscountReason" text;
