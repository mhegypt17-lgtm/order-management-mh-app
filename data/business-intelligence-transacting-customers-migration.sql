-- Adds transactingCustomers (customers with >=1 order) so avg-orders-per-
-- customer can divide by actual transacting customers instead of the full
-- customer table (which includes never-ordered records).
alter table business_intelligence_summary
  add column if not exists "transactingCustomers" int not null default 0;
