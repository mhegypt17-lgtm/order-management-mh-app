-- Voucher / discount-code persistence on the orders row.
--
-- Before this migration, OrderForm sent `discountCode` in the POST body but
-- the API never wrote it to the database, so reopening a saved order made
-- the applied voucher disappear and the branch had no way to know they owed
-- the customer a discount at physical collection.
--
-- After this migration:
--   * `discountCode`     — the code that CS applied at save time (uppercase).
--   * `discountAmount`   — the validated discount in EGP that was deducted.
--   * `netTotal`         — final amount the customer pays (orderTotal -
--                          discountAmount). Branch shows this prominently.
--
-- Safe to re-run.

alter table public.orders
  add column if not exists "discountCode"   text,
  add column if not exists "discountAmount" numeric not null default 0,
  add column if not exists "netTotal"       numeric;

create index if not exists orders_discount_code_idx on public.orders ("discountCode");
