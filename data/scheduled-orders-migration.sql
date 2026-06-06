-- Scheduled (حجز) orders feature.
-- Adds the four columns the OrderForm + APIs now write when orderStatus = 'حجز'.
--
-- Run inside the Supabase SQL editor. Safe to re-run.

alter table public.orders
  add column if not exists "isScheduled" boolean not null default false;

alter table public.orders
  add column if not exists "scheduledDate" date;

alter table public.orders
  add column if not exists "scheduledTimeSlot" text;

alter table public.orders
  add column if not exists "scheduledSpecificTime" text;

-- Optional: enforce allowed time-slot values when present.
alter table public.orders
  drop constraint if exists orders_scheduled_time_slot_check;

alter table public.orders
  add constraint orders_scheduled_time_slot_check
  check ("scheduledTimeSlot" is null or "scheduledTimeSlot" in ('صباحي', 'مسائي', 'ساعة محددة'));

create index if not exists orders_is_scheduled_idx on public.orders ("isScheduled");
create index if not exists orders_scheduled_date_idx on public.orders ("scheduledDate");
