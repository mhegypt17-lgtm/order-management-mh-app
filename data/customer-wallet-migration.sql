-- Customer wallet feature.
-- Adds a numeric "wallet" column on customers used as store credit that can
-- be applied as a discount on a future order.
--
-- Run inside the Supabase SQL editor. Safe to re-run.

alter table public.customers
  add column if not exists "wallet" numeric not null default 0;
