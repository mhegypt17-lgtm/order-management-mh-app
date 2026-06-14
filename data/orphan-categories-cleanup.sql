-- Find / fix orphan product categories
-- An "orphan" = a product whose productCategory string does not match any
-- name in the active product_categories table. These show as "⚠️" in the
-- products admin screen.

-- ── 1. List orphan categories with product counts ─────────────────────
-- Run this first to see what you're dealing with.
SELECT
  p."productCategory" AS orphan_category,
  COUNT(*)            AS product_count
FROM products p
LEFT JOIN product_categories c
  ON c.name = p."productCategory" AND c."isActive" = true
WHERE p."productCategory" IS NOT NULL
  AND p."productCategory" <> ''
  AND c.id IS NULL
GROUP BY p."productCategory"
ORDER BY product_count DESC;

-- ── 2a. Option A: rename an orphan to an existing category ────────────
-- Replace the two literals below with the orphan name and the correct
-- category name from product_categories, then run.
--
-- UPDATE products
--   SET "productCategory" = 'لحم فريش'
--   WHERE "productCategory" = 'لحوم';

-- ── 2b. Option B: promote an orphan to a real category ────────────────
-- Inserts the orphan name into product_categories so it appears in the
-- dropdown and stops being flagged. sortOrder = end of the list.
--
-- INSERT INTO product_categories (id, name, "isActive", "sortOrder", "createdAt", "updatedAt")
-- SELECT
--   gen_random_uuid(),
--   'لحوم',
--   true,
--   (SELECT COALESCE(MAX("sortOrder"), 0) + 1 FROM product_categories),
--   now(),
--   now()
-- WHERE NOT EXISTS (
--   SELECT 1 FROM product_categories WHERE name = 'لحوم'
-- );
