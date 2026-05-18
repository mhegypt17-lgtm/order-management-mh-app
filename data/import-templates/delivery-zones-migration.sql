-- Add `subArea` column to delivery_zones so each row represents (zone, area, subArea)
-- Run this once in Supabase → SQL Editor BEFORE importing delivery-zones-seed.csv.

ALTER TABLE delivery_zones
  ADD COLUMN IF NOT EXISTS "subArea" text DEFAULT '';

-- Optional: delete old 8 default rows before bulk-importing the new dataset.
-- DELETE FROM delivery_zones;
