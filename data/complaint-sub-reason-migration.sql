-- Adds an optional sub-reason column to complaints so agents can classify
-- complaints into a two-level hierarchy (parent reason → child sub-reason).
-- The parent stays in the existing `reason` column so all historical
-- complaints continue to render unchanged. The `subReason` column is
-- nullable — complaints classified before this migration keep it as null.
-- Run once against Supabase. Safe to re-run.

ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS "subReason" text;

-- Optional composite index for future "complaints by reason + sub-reason"
-- analytics dashboards. Cheap on a table this size and lets the app filter
-- by parent alone (WHERE reason = X) or by the pair.
CREATE INDEX IF NOT EXISTS complaints_reason_subreason_idx
  ON complaints (reason, "subReason");
