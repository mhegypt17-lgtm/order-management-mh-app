-- Wallet-credit usage on orders.
--
-- Customers accumulate a wallet balance (CRM > customer profile). CS can
-- apply some/all of that balance against a new or edited order as an extra
-- discount on top of any voucher code. We store the per-order amount used
-- in `walletUsed` so the customer's running balance can be reconstructed
-- and so admin can audit how much wallet was consumed where.
--
-- On every create/edit, the API writes the order's `walletUsed` and updates
-- the customer's wallet balance by the delta vs the previous value (so
-- editing an order to use 50 less credit refunds 50 back to the customer).
--
-- The final amount the branch collects is:
--   netTotal = max(0, orderTotal - discountAmount - walletUsed)
--
-- Safe to re-run.

alter table public.orders
  add column if not exists "walletUsed" numeric not null default 0;
