-- Manual B2B flag for customers.
-- The CRM already auto-labels a customer "B2B" if ANY of their orders was
-- placed with orderType = 'B2B' (see src/app/api/crm/customers/route.ts).
-- That covers customers who already have order history. This column lets
-- CS/admin mark a customer as B2B at creation time (or any time after),
-- e.g. a corporate account added before their first order exists. The
-- displayed "B2B" badge is manualFlag OR auto-derived-from-orders — whichever
-- is true.
--
-- Run inside the Supabase SQL editor. Safe to re-run.

alter table public.customers
  add column if not exists "isB2B" boolean not null default false;

create index if not exists customers_is_b2b_idx on public.customers ("isB2B");
