-- Customer status feature.
-- Adds active/warning/suspended status, last-change metadata, and a marker
-- timestamp used by the auto-activate rule (count clean orders since this).
--
-- Run inside the Supabase SQL editor. Safe to re-run.

alter table public.customers
  add column if not exists "status" text not null default 'active';

-- Drop & recreate check to be idempotent across re-runs / future tweaks.
alter table public.customers
  drop constraint if exists customers_status_check;

alter table public.customers
  add constraint customers_status_check
  check (status in ('active', 'warning', 'suspended'));

alter table public.customers
  add column if not exists "statusReason" text;

alter table public.customers
  add column if not exists "statusUpdatedAt" timestamptz;

alter table public.customers
  add column if not exists "statusUpdatedBy" text;

create index if not exists customers_status_idx on public.customers ("status");
