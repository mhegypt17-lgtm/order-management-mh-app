-- Phase 2F.2 — orders_dashboard_v1 view
--
-- Bundles the 4 dashboard reads (orders + customers + customer_addresses +
-- order_delivery) into a single JOIN so /api/orders GET only issues ONE
-- PostgREST request per page load instead of four. Items and products are
-- still fetched separately because they are 1:many.
--
-- Row shape = every orders.* column, plus three nested jsonb objects
-- (`customer`, `address`, `delivery`) built with an explicit column
-- allowlist. IMPORTANT: `delivery` uses the LIST allowlist — it does NOT
-- include productPhotos / invoicePhoto. Detail views that need the photos
-- keep hitting /api/branch/orders/[id] which reads the full table row.
--
-- HOW TO RUN
-- ----------
-- 1. Open the Supabase SQL Editor for the project.
-- 2. Paste this whole file and click "Run".
-- 3. If any of the column names below don't exist in your DB (schema
--    drift), Postgres will error out on this statement — none of your
--    existing tables are touched, and the view either fully replaces or
--    fully fails. The API has a graceful fallback so the dashboard keeps
--    working even without this view.
-- 4. Idempotent — safe to re-run after schema changes.
--
-- COLUMN NOTES
-- ------------
-- - Column names use camelCase and are double-quoted to match the existing
--   migrations in this folder.
-- - `case when X.id is not null then jsonb_build_object(...) else null end`
--   preserves the "no customer / no delivery" states the client expects.
--   Without the CASE, jsonb_build_object would return `{"id":null,...}`
--   which is truthy and would break "is this order missing a customer?"
--   checks in the UI.

create or replace view public.orders_dashboard_v1 as
select
  o.*,

  -- Customer (allowlist matches CUSTOMER_COLUMNS in src/lib/omsData.ts)
  case when c.id is not null then jsonb_build_object(
    'id',                  c.id,
    'phone',               c.phone,
    'customerName',        c."customerName",
    'email',               c.email,
    'notes',               c.notes,
    'wallet',              c.wallet,
    'createdAt',           c."createdAt",
    'updatedAt',           c."updatedAt",
    'status',              c.status,
    'statusReason',        c."statusReason",
    'statusUpdatedAt',     c."statusUpdatedAt",
    'statusUpdatedBy',     c."statusUpdatedBy",
    'doNotFollowUp',       c."doNotFollowUp",
    'followUpSnoozeUntil', c."followUpSnoozeUntil"
  ) else null end as customer,

  -- Address (allowlist matches ADDRESS_COLUMNS in src/lib/omsData.ts)
  case when a.id is not null then jsonb_build_object(
    'id',             a.id,
    'customerId',     a."customerId",
    'addressLabel',   a."addressLabel",
    'area',           a.area,
    'subArea',        a."subArea",
    'streetAddress',  a."streetAddress",
    'googleMapsLink', a."googleMapsLink",
    'createdAt',      a."createdAt"
  ) else null end as address,

  -- Delivery (allowlist matches DELIVERY_COLUMNS_LIST — NO photos)
  case when d.id is not null then jsonb_build_object(
    'id',                d.id,
    'orderId',           d."orderId",
    'deliveryStatus',    d."deliveryStatus",
    'branchComments',    d."branchComments",
    'deliveredAt',       d."deliveredAt",
    'updatedBy',         d."updatedBy",
    'updatedAt',         d."updatedAt",
    'acceptedAt',        d."acceptedAt",
    'readyAt',           d."readyAt",
    'outForDeliveryAt',  d."outForDeliveryAt"
  ) else null end as delivery

from public.orders o
left join public.customers          c on c.id       = o."customerId"
left join public.customer_addresses a on a.id       = o."deliveryAddressId"
left join public.order_delivery     d on d."orderId" = o.id;

-- Let the Supabase anon / service roles read the view via PostgREST.
-- (Views inherit table permissions, but explicit grants help clarity.)
grant select on public.orders_dashboard_v1 to anon, authenticated, service_role;

-- Done.
