-- Adds the team-wide monthly goal (units) for targeted products.
-- Safe to run multiple times.

ALTER TABLE order_settings
  ADD COLUMN IF NOT EXISTS "monthlyTargetedUnitsGoal" integer NOT NULL DEFAULT 0;

-- Sanity check (optional): show the singleton row's current value
-- SELECT id, "monthlyTargetedUnitsGoal" FROM order_settings WHERE id = 'singleton';
