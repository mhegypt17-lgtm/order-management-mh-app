-- Product stock tracking feature (branch availability).
-- Adds the columns used by /api/products/stock + branch products page.
--
-- Run inside the Supabase SQL editor. Safe to re-run.

alter table public.products
  add column if not exists "stockStatus" text not null default 'available';

alter table public.products
  drop constraint if exists products_stock_status_check;

alter table public.products
  add constraint products_stock_status_check
  check ("stockStatus" in ('available', 'low', 'out'));

alter table public.products
  add column if not exists "stockQuantity" numeric;

alter table public.products
  add column if not exists "stockUpdatedAt" timestamptz;

alter table public.products
  add column if not exists "stockUpdatedBy" text;

create index if not exists products_stock_status_idx on public.products ("stockStatus");
