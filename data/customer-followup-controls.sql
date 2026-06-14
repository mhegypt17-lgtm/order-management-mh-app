-- Per-customer retention controls
-- Adds opt-out flag and snooze timestamp used by /api/notifications to
-- suppress auto follow-up tasks/notifications for specific customers.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS "doNotFollowUp" boolean NOT NULL DEFAULT false;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS "followUpSnoozeUntil" timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_customers_donotfollowup
  ON customers ("doNotFollowUp")
  WHERE "doNotFollowUp" = true;
