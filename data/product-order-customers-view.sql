-- product_order_customers_v1 — egress-optimised view for "which customers
-- ordered product X" reports (Top Customers by Product, CRM section).
--
-- Joins order_items -> orders -> order_delivery -> customers at the
-- Postgres level and pre-filters to COMPLETED orders only, using the SAME
-- "sold" definition as /api/reports/product-sales:
--   orderStatus = 'تم'  OR  order_delivery.deliveryStatus = 'تم التوصيل'
--
-- WHY THIS IS LOW-EGRESS
-- -----------------------
-- The API route that reads this view ALWAYS adds `.eq("productId", …)` on
-- top (order_items already has an index on "productId" — see
-- hot-query-indexes.sql). That means only the order lines for the ONE
-- requested product ever cross the wire — never a full order_items/orders
-- table scan, regardless of how many orders the store has processed.
-- An optional orderDate range filter (`.gte`/`.lte`) narrows it further.
--
-- HOW TO RUN
-- ----------
-- 1. Open the Supabase SQL Editor for the project.
-- 2. Paste this whole file and click "Run".
-- 3. Idempotent — safe to re-run (drops and recreates the view).

drop view if exists public.product_order_customers_v1;

create view public.product_order_customers_v1 as
select
  oi."productId",
  oi."orderId",
  oi.quantity,
  o."orderDate",
  o."customerId",
  c."customerName",
  c.phone as "customerPhone",
  c.email as "customerEmail"
from public.order_items oi
join public.orders o on o.id = oi."orderId"
left join public.order_delivery d on d."orderId" = o.id
left join public.customers c on c.id = o."customerId"
where o."customerId" is not null
  and (o."orderStatus" = 'تم' or d."deliveryStatus" = 'تم التوصيل');

-- Let the Supabase anon / service roles read the view via PostgREST.
grant select on public.product_order_customers_v1 to anon, authenticated, service_role;

-- Done.
