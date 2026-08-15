-- Mega Orders feature (2026-08-15)
-- 1) Adds the admin-configurable EGP threshold column to order_settings.
-- 2) Adds a Postgres function that computes the per-agent mega-order count
--    for a date range ENTIRELY inside Postgres (GROUP BY runs server-side),
--    so the API route only ever pulls back a handful of aggregated rows
--    (one per agent) instead of every matching order row — the
--    lowest-egress way to serve this report on demand.
--
-- Formula: an order counts as "mega" when it is delivered
-- (order_delivery.deliveryStatus = 'تم التوصيل') AND
--   orderTotal - deliveryFee - discountAmount - manualDiscountAmount >= threshold
-- (net of discount codes/B2B manual discounts, but NOT wallet credit, and
-- excluding the delivery fee — matches the "net total after discounts (not
-- wallet) - delivery fee" formula confirmed with the admin).

ALTER TABLE order_settings
  ADD COLUMN IF NOT EXISTS "megaOrderThreshold" numeric DEFAULT 3000;

CREATE OR REPLACE FUNCTION get_mega_orders_summary(
  p_threshold numeric,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (agent text, mega_orders_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    o."createdBy" AS agent,
    COUNT(*) AS mega_orders_count
  FROM orders o
  JOIN order_delivery d ON d."orderId" = o.id
  WHERE o."orderDate" >= p_start_date
    AND o."orderDate" <= p_end_date
    AND d."deliveryStatus" = 'تم التوصيل'
    AND (
      o."orderTotal"
      - o."deliveryFee"
      - COALESCE(o."discountAmount", 0)
      - COALESCE(o."manualDiscountAmount", 0)
    ) >= p_threshold
  GROUP BY o."createdBy"
  ORDER BY mega_orders_count DESC;
$$;
