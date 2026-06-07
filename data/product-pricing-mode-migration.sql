-- Step 1 / weight-vs-unit pricing.
-- Adds a pricingMode flag to products. 'unit' = sold per piece at fixed price
-- (today's behaviour). 'weight' = sold per kilo; basePrice is interpreted as
-- price-per-kg and the line total = pricePerKg * actualWeightKg.
--
-- All existing rows default to 'unit' so behaviour is unchanged until an admin
-- explicitly switches a product (e.g. chicken) to 'weight' mode.
--
-- Run inside the Supabase SQL editor. Safe to re-run.

alter table public.products
  add column if not exists "pricingMode" text not null default 'unit';

alter table public.products
  drop constraint if exists products_pricing_mode_check;

alter table public.products
  add constraint products_pricing_mode_check
  check ("pricingMode" in ('unit', 'weight'));

create index if not exists products_pricing_mode_idx on public.products ("pricingMode");
