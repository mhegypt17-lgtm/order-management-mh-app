-- Egress spike fix (2026-08-11) — two confirmed schema-drift bugs found in
-- the Supabase Postgres logs for 10 Aug 2026 (the 283 MB spike day):
--
-- 1. "column orders_dashboard_v1.manualDiscountType does not exist"
--    The custom-items-and-manual-discount migration added 4 columns to
--    `orders` and to ORDER_COLUMNS_LIST (src/lib/omsData.ts), but the
--    orders_dashboard_v1 view was never updated to expose them. Every
--    single /api/orders GET (the busiest endpoint — every dashboard/branch
--    list load) was failing the optimized single-JOIN view query and
--    silently falling back to the slower 4-round-trip path. This is the
--    prime suspect for the spike, since it started right after that
--    feature shipped.
--
--    Fixed here with `create or replace view` (NOT drop+recreate) — safe,
--    zero-downtime, because we are only ADDING columns at the end of the
--    output list, which Postgres allows without dropping the view.
--
-- 2. "column tasks.completedAt does not exist"
--    src/app/api/notifications/route.ts and src/app/admin/retention/page.tsx
--    both select a `completedAt` column from `tasks` that was never in the
--    base schema (00-base-schema.sql only has createdAt/updatedAt). This is
--    a pre-existing bug (not from this session), firing on every
--    notifications poll for cs/admin roles. Lower egress impact than #1,
--    but still wasted round trips + log noise — fixed by adding the column.
--
-- Safe to run multiple times.

-- 1. Patch orders_dashboard_v1 without dropping it.
create or replace view public.orders_dashboard_v1 as
select
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
  ) else null end as delivery,

  -- NEW — must stay at the end of the SELECT list; `create or replace view`
  -- only allows appending columns, not inserting them in the middle.
  o."manualDiscountType",
  o."manualDiscountValue",
  o."manualDiscountAmount",
  o."manualDiscountReason"

from public.orders o
left join public.customers          c on c.id       = o."customerId"
left join public.customer_addresses a on a.id       = o."deliveryAddressId"
left join public.order_delivery     d on d."orderId" = o.id;

grant select on public.orders_dashboard_v1 to anon, authenticated, service_role;

-- 2. Add the missing tasks.completedAt column (nothing currently writes to
--    it, so it will be null until a future change stamps it on completion —
--    existing code already falls back to updatedAt when it's null).
alter table public.tasks
  add column if not exists "completedAt" timestamptz;
