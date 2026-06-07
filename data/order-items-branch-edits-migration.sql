-- Step 4 / weight-vs-unit pricing — branch-side line edits.
--
-- Adds two nullable snapshot columns to order_items so the branch can amend
-- quantity and (for weight-mode lines) the actual weighed grams without
-- losing the original values CS captured at order entry.
--
-- Semantics:
--   * "originalQuantity"     — set the first time the branch changes quantity;
--                              never overwritten by later branch edits. NULL
--                              means qty has never been amended by the branch.
--   * "originalWeightGrams"  — set the first time the branch changes the
--                              weight on a weight-mode line; never overwritten.
--                              NULL means weight has never been amended.
--
-- CS uses presence of these columns to render an "تم تعديل من الفرع" badge
-- and show "original → new" deltas on the order review screen.
--
-- Run inside the Supabase SQL editor. Safe to re-run.

alter table public.order_items
  add column if not exists "originalQuantity" numeric;

alter table public.order_items
  add column if not exists "originalWeightGrams" numeric;
