-- Tier 1 "Customer Intelligence" persisted scores. Computed once nightly by
-- /api/cron/customer-intelligence (see vercel.json crons) — NOT recalculated
-- on every page load. One row per customer, overwritten on each run (no
-- history kept, per product decision 2026-09-15).
create table if not exists customer_intelligence_scores (
  "customerId" text primary key references customers(id) on delete cascade,
  "customerName" text not null,
  phone text,
  r int not null,
  f int not null,
  m int not null,
  "rfmLabel" text not null,
  "lifecycleStage" text not null,
  "healthScore" int not null,
  "healthBreakdown" jsonb not null,
  "churnRisk" text not null,
  "retentionPct" int not null,
  "daysSinceLastOrder" int,
  "typicalIntervalDays" int,
  "totalOrders" int not null default 0,
  "totalRevenue" numeric not null default 0,
  "cohortMonth" text,
  "isReactivatedOpportunity" boolean not null default false,
  "isSpendingUp" boolean not null default false,
  "computedAt" timestamptz not null default now()
);

create index if not exists idx_customer_intelligence_scores_lifecycle
  on customer_intelligence_scores ("lifecycleStage");
