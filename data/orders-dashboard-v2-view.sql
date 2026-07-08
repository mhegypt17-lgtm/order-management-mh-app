-- Phase 2H — orders_dashboard_v1 view (v2, egress-optimised)
--
-- Replaces `o.*` in the v1 view with an explicit column allowlist that
-- OMITS `csAttachments`. Every /api/orders GET hits this view, so the old
-- `o.*` was silently paying to ship base64 CS attachments on every
-- dashboard poll — 40 orders × 3 MB = 120 MB of egress you never rendered.
--
-- The API layer already selects an explicit column list from this view
-- (see ORDER_COLUMNS_LIST in src/lib/omsData.ts + the destructure guard
-- in /api/orders/route.ts::tryReadDashboardWindow), so this SQL change is
-- defence-in-depth: even a future `select('*')` on the view cannot leak
-- csAttachments.
--
-- HOW TO RUN
-- ----------
-- 1. Open the Supabase SQL Editor for the project.
-- 2. Paste this whole file and click "Run".
-- 3. Idempotent — safe to re-run.
-- 4. The API has a graceful fallback path if the view is missing, so
--    running this out of order will not break Production.
--
-- NOTE: We `drop view` first because Postgres refuses to remove columns
-- from an existing view via `create or replace view` (ERROR 42P16). The
-- previous v1 view exposed `csAttachments` via `o.*`; the new definition
-- has no such column, which is exactly the change that triggers the error.
-- Dropping and recreating in the same transaction is safe — the view has
-- no dependants (nothing else in the DB references it).

drop view if exists public.orders_dashboard_v1;

create view public.orders_dashboard_v1 as
select
  -- ORDER columns — explicit allowlist (mirrors ORDER_COLUMNS_LIST in
  -- src/lib/omsData.ts). csAttachments is intentionally OMITTED.
  o.id,
  o."appOrderNo",
  o."orderDate",
  o."orderTime",
  o."orderType",
  o."orderReceiver",
  o."orderMethod",
  o."customerType",
  o."customerSource",
  o."orderStatus",
  o."cancellationReason",
  o."paymentMethod",
  o."customerId",
  o."deliveryAddressId",
  o.notes,
  o."followUp",
  o."followUpNotes",
  o.subtotal,
  o."deliveryFee",
  o."orderTotal",
  o."createdBy",
  o."createdAt",
  o."updatedAt",
  o."isScheduled",
  o."scheduledDate",
  o."scheduledTimeSlot",
  o."scheduledSpecificTime",
  o."isPriority",
  o."priorityReason",
  o."discountCode",
  o."discountAmount",
  o."netTotal",
  o."walletUsed",

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
grant select on public.orders_dashboard_v1 to anon, authenticated, service_role;

-- Done.
