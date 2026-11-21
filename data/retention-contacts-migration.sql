-- Outbound retention calls logged by CS from the "اتصل بهم اليوم" queue.
-- One row per call. Outcomes (won / lost) are NOT stored: they are derived
-- from the orders placed after each call, so nothing extra is ever entered.
--
-- Safe to re-run.

create table if not exists public.retention_contacts (
  id                 text primary key,
  "customerId"       text not null,
  agent              text not null default '',
  "contactedAt"      timestamptz not null default now(),
  result             text not null,            -- no_answer | wrong_number | answered | promised | ordered | not_interested
  reason             text,                     -- why not interested (price, quality, delivery, ...)
  note               text not null default '',
  offer              text not null default '', -- offer / incentive used on the call
  "nextCallAt"       timestamptz,              -- customer leaves the queue until then
  -- Snapshot at call time so results can be grouped without joining history.
  stage              integer,                  -- retention stage 1-3
  "daysInactive"     integer,
  segment            text,                     -- lifecycle stage (VIP, At Risk, ...)
  "spendAtContact"   numeric,
  "createdAt"        timestamptz not null default now()
);

create index if not exists retention_contacts_customer_idx on public.retention_contacts ("customerId", "contactedAt" desc);
create index if not exists retention_contacts_contactedat_idx on public.retention_contacts ("contactedAt" desc);

grant select, insert, update, delete on public.retention_contacts
  to anon, authenticated, service_role;
