-- CS call log — every inbound call/inquiry CS receives, whether the
-- caller is an existing customer or a prospect. Lets supervisors search
-- by phone/name and filter by date to audit responses or follow up on
-- prospects who never converted.
--
-- Safe to re-run.

create table if not exists public.cs_call_logs (
  id            text primary key,
  "callDate"    text not null,                  -- 'YYYY-MM-DD' Cairo wall-clock
  "callTime"    text not null,                  -- 'HH:MM' 24h
  "customerName" text not null default '',
  phone         text not null default '',
  email         text not null default '',
  inquiry       text not null default '',
  response      text not null default '',
  -- Soft link to an existing customer row when phone matches. NULL when
  -- the caller is a prospect not yet in the CRM.
  "customerId"  text,
  "loggedBy"    text not null default '',       -- CS agent name at log time
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);

create index if not exists cs_call_logs_phone_idx     on public.cs_call_logs (phone);
create index if not exists cs_call_logs_calldate_idx  on public.cs_call_logs ("callDate");
create index if not exists cs_call_logs_customer_idx  on public.cs_call_logs ("customerId");

grant select, insert, update, delete on public.cs_call_logs
  to anon, authenticated, service_role;
