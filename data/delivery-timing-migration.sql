-- Delivery-stage timestamps on order_delivery.
--
-- Today the only timestamp recorded is `deliveredAt` (set the first time
-- the branch flips deliveryStatus to "تم التوصيل"). To compute the average
-- time-to-deliver and surface bottlenecks per stage, we also need to know
-- WHEN the branch first received/accepted the order and the intermediate
-- transitions.
--
-- New columns (all nullable, stored as timestamptz):
--   acceptedAt        — first time deliveryStatus moved off "لم يخرج بعد"
--                       (i.e. the branch acknowledged / accepted the order)
--   readyAt           — first time status hit "جاهز"
--   outForDeliveryAt  — first time status hit "في الطريق"
--
-- The API code is defensive: if this migration hasn't been run yet, the
-- branch PUT endpoint will retry the write without these columns and the
-- order/status update will still succeed (only the timing data is lost
-- until the migration runs).
--
-- Safe to re-run.

alter table public.order_delivery
  add column if not exists "acceptedAt"       timestamptz,
  add column if not exists "readyAt"          timestamptz,
  add column if not exists "outForDeliveryAt" timestamptz;

create index if not exists order_delivery_delivered_at_idx
  on public.order_delivery ("deliveredAt");
create index if not exists order_delivery_accepted_at_idx
  on public.order_delivery ("acceptedAt");
