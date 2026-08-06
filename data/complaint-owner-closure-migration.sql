-- Complaints: adds two optional fields.
-- 1. "complaintOwner" — المسؤول عن الشكوى: the department responsible for
--    the underlying issue (فرع / مصنع / مبيعات / ديليفري by default).
--    Distinct from "assignedTo" (متلقي الشكوى — the CS agent handling the
--    ticket).
-- 2. "closureAction" — recorded once a ticket is closed (تم التعامل مع
--    العميل / اعتراض العميل / تم تعويض العميل by default).
--
-- Both option lists are admin-editable in Order Settings (order_settings
-- table, "complaintOwners" / "complaintClosureActions" jsonb columns added
-- below) — no code change needed to add/rename/disable a value later.
--
-- The app degrades gracefully if this hasn't been run yet — complaint
-- create/update falls back to dropping these two fields until the columns
-- exist (see createComplaint/updateComplaint in src/lib/omsData.ts).
--
-- Run inside the Supabase SQL editor. Safe to re-run.

alter table public.complaints
  add column if not exists "complaintOwner" text,
  add column if not exists "closureAction" text;

alter table public.order_settings
  add column if not exists "complaintOwners" jsonb,
  add column if not exists "complaintClosureActions" jsonb;

-- Force PostgREST to pick up the new columns immediately instead of
-- possibly serving a stale "column not found in schema cache" error for a
-- while after this runs.
notify pgrst, 'reload schema';
