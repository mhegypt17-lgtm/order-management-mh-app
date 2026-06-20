-- Per-agent time slots + notes inside a shift
-- Each shift can now have N agents with their own start/end and notes.
-- The legacy `agents: text[]` and shift-level startTime/endTime stay for
-- backward compatibility (the API populates `assignments` from them when
-- a row is missing this field).

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS assignments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- One-time backfill: for any shift that has agents[] but no assignments yet,
-- create one assignment per agent using the shift's overall start/end.
UPDATE shifts s
SET assignments = (
  SELECT jsonb_agg(jsonb_build_object(
    'agentName', a,
    'startTime', s."startTime",
    'endTime',   s."endTime",
    'notes',     ''
  ))
  FROM unnest(s.agents) AS a
)
WHERE (s.assignments IS NULL OR s.assignments = '[]'::jsonb)
  AND array_length(s.agents, 1) IS NOT NULL;
