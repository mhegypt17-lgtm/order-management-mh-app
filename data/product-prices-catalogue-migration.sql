-- Multi-catalogue (LOB) pricing + stock.
--
-- Each product can now be priced and stocked independently per "catalogue"
-- (a named price list mapped to one or more order types). The default
-- catalogue, key 'online', covers Online + App orders and stays backed by
-- the existing products.basePrice/offerPrice/stockStatus/stockQuantity
-- columns (zero migration needed for existing data). Any additional
-- catalogue (Instashop, B2B, or a future one) is expressed by a row in the
-- new product_prices table.
--
-- Run inside the Supabase SQL editor. Safe to re-run.

create table if not exists public.product_prices (
  id uuid primary key default gen_random_uuid(),
  "productId" text not null references public.products(id) on delete cascade,
  "catalogueKey" text not null,
  "basePrice" numeric,
  "offerPrice" numeric,
  "stockStatus" text not null default 'available',
  "stockQuantity" numeric,
  "updatedAt" timestamptz not null default now(),
  "updatedBy" text,
  unique ("productId", "catalogueKey")
);

alter table public.product_prices
  drop constraint if exists product_prices_stock_status_check;

alter table public.product_prices
  add constraint product_prices_stock_status_check
  check ("stockStatus" in ('available', 'low', 'out'));

create index if not exists product_prices_product_id_idx on public.product_prices ("productId");
create index if not exists product_prices_catalogue_key_idx on public.product_prices ("catalogueKey");

-- Backfill: seed the 'online' catalogue for every existing product from its
-- current base columns, so nothing breaks day one and admin/branch/CS tabs
-- show real data immediately for the default catalogue.
insert into public.product_prices
  ("productId", "catalogueKey", "basePrice", "offerPrice", "stockStatus", "stockQuantity", "updatedAt")
select
  id, 'online', "basePrice", "offerPrice", coalesce("stockStatus", 'available'), "stockQuantity", now()
from public.products
on conflict ("productId", "catalogueKey") do nothing;

-- Catalogues config (name + which order types map to it), stored as JSON on
-- order_settings — same pattern already used for `retention` / `agentNotice`.
alter table public.order_settings
  add column if not exists "catalogues" jsonb;

-- Explicit catalogue membership -----------------------------------------
-- Two LOBs can have genuinely different assortments (some SKUs shared,
-- some Instashop/B2B-only, some Online-only). Membership must be explicit,
-- not implied by price:
--   - 'online' membership = this new boolean flag (defaults to true so
--     every existing product keeps behaving exactly as it does today).
--   - Any other catalogue's membership = the presence of a `product_prices`
--     row for that (productId, catalogueKey) — no row means "not sold in
--     that catalogue at all", full stop.
alter table public.products
  add column if not exists "onlineEnabled" boolean not null default true;

-- One-time backfill: give every existing product a starting row in every
-- catalogue that is active today, copied from its current online price/
-- stock. This satisfies "existing products start out available everywhere"
-- — admins then remove/adjust per catalogue as assortments diverge.
-- Re-run (or add more INSERT blocks) if you add further catalogue keys.
insert into public.product_prices
  ("productId", "catalogueKey", "basePrice", "offerPrice", "stockStatus", "stockQuantity", "updatedAt")
select id, 'instashop', "basePrice", "offerPrice", coalesce("stockStatus", 'available'), "stockQuantity", now()
from public.products
on conflict ("productId", "catalogueKey") do nothing;

insert into public.product_prices
  ("productId", "catalogueKey", "basePrice", "offerPrice", "stockStatus", "stockQuantity", "updatedAt")
select id, 'b2b', "basePrice", "offerPrice", coalesce("stockStatus", 'available'), "stockQuantity", now()
from public.products
on conflict ("productId", "catalogueKey") do nothing;
