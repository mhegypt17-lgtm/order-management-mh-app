-- Adds the customerIntelligence config column to order_settings, used by
-- the Tier 1 "Customer Intelligence" scoring (RFM / lifecycle / health
-- score). Run this once in the Supabase SQL editor.
alter table order_settings
  add column if not exists "customerIntelligence" jsonb;
