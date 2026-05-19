-- Phase 2: add subArea to address-bearing tables so orders can match
-- delivery zones precisely on (area + subArea).
-- Run once in Supabase → SQL Editor.

ALTER TABLE customer_addresses
  ADD COLUMN IF NOT EXISTS "subArea" text DEFAULT '';

ALTER TABLE adahi_orders
  ADD COLUMN IF NOT EXISTS "subArea" text DEFAULT '';

-- Tell PostgREST to reload its schema cache so the new columns are
-- recognised immediately by the API.
NOTIFY pgrst, 'reload schema';
