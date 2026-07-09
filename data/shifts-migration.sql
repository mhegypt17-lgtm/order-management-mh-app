-- Shifts (base table) — CS agent shift planner.
--
-- Referenced by src/app/api/shifts/route.ts and src/components/admin/
-- ShiftPlannerView.tsx. Row shape mirrors the `Shift` interface in the
-- API route.
--
-- Run this BEFORE data/shift-assignments-migration.sql (which just adds
-- the assignments jsonb column and backfills it from agents[]). This file
-- is fully idempotent and safe to re-run.

create table if not exists public.shifts (
  id           text primary key,
  name         text not null default '',
  "startTime"  text not null default '09:00',   -- HH:mm envelope
  "endTime"    text not null default '17:00',
  "daysOfWeek" int[] not null default '{}'::int[],   -- 0=Sun … 6=Sat
  agents       text[] not null default '{}'::text[], -- legacy flat list
  assignments  jsonb  not null default '[]'::jsonb,  -- per-agent slots
  active       boolean not null default true,
  "createdAt"  timestamptz not null default now(),
  "updatedAt"  timestamptz not null default now()
);

create index if not exists shifts_active_idx    on public.shifts (active);
create index if not exists shifts_createdat_idx on public.shifts ("createdAt" desc);

grant select, insert, update, delete on public.shifts
  to anon, authenticated, service_role;
