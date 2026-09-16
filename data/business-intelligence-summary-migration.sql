-- Global "Business Intelligence" lifetime aggregates for the main Admin
-- dashboard (avg order interval, avg order value, avg orders/customer).
-- Single row (id='global'), recomputed nightly alongside Customer
-- Intelligence (see src/lib/customerIntelligenceRecompute.ts) — NOT
-- calculated on every dashboard page load.
create table if not exists business_intelligence_summary (
  id text primary key default 'global',
  "avgOrderIntervalDays" numeric,
  "avgOrderValue" numeric not null default 0,
  "avgOrdersPerCustomer" numeric not null default 0,
  "totalCustomers" int not null default 0,
  "totalOrders" int not null default 0,
  "totalRevenue" numeric not null default 0,
  "computedAt" timestamptz not null default now()
);
