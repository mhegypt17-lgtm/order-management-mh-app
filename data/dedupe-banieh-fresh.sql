-- ============================================================
-- Deduplicate the two "بانيه فريش" products
-- ============================================================
-- Run each STEP separately in Supabase SQL Editor and INSPECT the
-- output before running the next step. Nothing is destructive until
-- STEP 4. If anything looks wrong, stop and share the output.
-- ============================================================


-- ============================================================
-- STEP 1 — See both duplicates side by side
-- ============================================================
-- Look at basePrice / offerPrice / createdAt to decide which row is
-- the "real" one you want to KEEP. Usually the older row (earlier
-- createdAt) is the canonical one — it's referenced by more orders.
-- Copy both IDs into the placeholders further down.
-- ============================================================
select
  id,
  "productName",
  "productCategory",
  "basePrice",
  "offerPrice",
  "isActive",
  "stockStatus",
  "createdAt",
  "updatedAt"
from public.products
where trim("productName") = 'بانيه فريش'
order by "createdAt" asc;


-- ============================================================
-- STEP 2 — Count how many orders / complaints reference each
-- ============================================================
-- Whichever row has MORE order_items references is the one you want
-- to KEEP (deleting it would strand historical orders). If both are
-- equal or zero, keep whichever has the price you want.
-- ============================================================
with dupes as (
  select id, "createdAt"
  from public.products
  where trim("productName") = 'بانيه فريش'
)
select
  d.id                                              as product_id,
  d."createdAt"                                     as product_created,
  (select count(*) from public.order_items
     where "productId" = d.id)                      as order_items_count,
  (select count(*) from public.complaints
     where "productIds" @> to_jsonb(d.id))          as complaints_count
from dupes d
order by d."createdAt" asc;


-- ============================================================
-- STEP 3 — Reassign references from LOSER to KEEPER
-- ============================================================
-- Fill in the two IDs from STEP 1 output, then run this block.
-- Nothing is deleted yet — this only moves references off the loser
-- so STEP 4 can safely drop it without breaking any history.
-- ============================================================
-- BEGIN;   -- (Supabase SQL editor auto-wraps in a tx; uncomment if using psql)

-- >>> EDIT THESE TWO LINES <<<
--   KEEPER_ID  = the row you want to keep (usually the older one)
--   LOSER_ID   = the row you want to delete
-- Example (replace with real IDs from STEP 1):
--   keeper_id = 'prod_1710000000000_abc123def'
--   loser_id  = 'prod_1720000000000_xyz789ghi'

-- 3a. Move any order_items pointing at LOSER onto KEEPER
update public.order_items
   set "productId" = 'REPLACE_WITH_KEEPER_ID'
 where "productId" = 'REPLACE_WITH_LOSER_ID';

-- 3b. Move any complaint productIds arrays pointing at LOSER onto KEEPER.
--     This rewrites the jsonb array in-place, swapping loser for keeper
--     (jsonb path #- + || is the postgres way to do array element replace).
update public.complaints
   set "productIds" = (
     select jsonb_agg(
       case when elem = to_jsonb('REPLACE_WITH_LOSER_ID'::text)
            then to_jsonb('REPLACE_WITH_KEEPER_ID'::text)
            else elem end
     )
     from jsonb_array_elements("productIds") as elem
   )
 where "productIds" @> to_jsonb('REPLACE_WITH_LOSER_ID'::text);

-- 3c. Verify NO references remain to the loser (should return 0, 0)
select
  (select count(*) from public.order_items where "productId" = 'REPLACE_WITH_LOSER_ID')   as remaining_order_items,
  (select count(*) from public.complaints  where "productIds" @> to_jsonb('REPLACE_WITH_LOSER_ID'::text)) as remaining_complaints;

-- COMMIT;   -- (uncomment if using psql)


-- ============================================================
-- STEP 4 — Finally, delete the LOSER row
-- ============================================================
-- Only run this AFTER STEP 3c returned (0, 0).
-- ============================================================
delete from public.products
 where id = 'REPLACE_WITH_LOSER_ID';


-- ============================================================
-- STEP 5 — Confirm only one 'بانيه فريش' remains
-- ============================================================
select id, "productName", "basePrice", "offerPrice"
from public.products
where trim("productName") = 'بانيه فريش';
-- Expected: exactly one row.
