-- Phase 2F.1 — hot-query indexes
--
-- Adds btree indexes on the columns the app filters/sorts on most often
-- (dashboard window, complaints window, notification bell polling, CRM
-- lookups, targeted-stats). Every statement uses `IF NOT EXISTS`, so this
-- file is idempotent and safe to re-run.
--
-- HOW TO RUN
-- ----------
-- 1. Open the Supabase SQL Editor for the project.
-- 2. Paste this whole file and click "Run".
-- 3. Watch for "success" — indexes that already exist are silently skipped.
--
-- NOTE ON CONCURRENCY
-- -------------------
-- Supabase's SQL Editor wraps each request in a transaction, and
-- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. For a
-- small/medium DB the blocking CREATE INDEX below completes in seconds
-- per index and is fine. For very large tables, run each statement
-- separately via `psql` or the Supabase CLI with
-- `CREATE INDEX CONCURRENTLY IF NOT EXISTS ...` instead.

-- ============================================================
-- orders — biggest impact, most-queried table
-- ============================================================

-- Dashboard window: WHERE "orderDate" BETWEEN ? AND ? ORDER BY "orderDate" DESC
create index if not exists orders_order_date_desc_idx
  on public.orders ("orderDate" desc);

-- Status filters (dashboard chips, complaints linkage, adahi filters)
create index if not exists orders_order_status_idx
  on public.orders ("orderStatus");

-- Customer / address lookups (CRM detail, POST enrichment, VIEW joins)
create index if not exists orders_customer_id_idx
  on public.orders ("customerId");

create index if not exists orders_delivery_address_id_idx
  on public.orders ("deliveryAddressId");

-- Realtime debounce + edit-history correlates on updatedAt
create index if not exists orders_updated_at_idx
  on public.orders ("updatedAt" desc);

-- Scheduled (حجز) orders page: WHERE "isScheduled" = true AND "scheduledDate" = ?
create index if not exists orders_scheduled_partial_idx
  on public.orders ("scheduledDate")
  where "isScheduled" = true;

-- Priority badges / filter
create index if not exists orders_priority_partial_idx
  on public.orders ("orderDate" desc)
  where "isPriority" = true;

-- ============================================================
-- order_items — read on every order enrichment
-- ============================================================

create index if not exists order_items_order_id_idx
  on public.order_items ("orderId");

-- targeted-stats groups by productId across a date range
create index if not exists order_items_product_id_idx
  on public.order_items ("productId");

-- ============================================================
-- order_delivery — one row per order, joined for enrichment
-- ============================================================

-- Unique so the LEFT JOIN in orders_dashboard_v1 stays 1:1
create unique index if not exists order_delivery_order_id_uidx
  on public.order_delivery ("orderId");

create index if not exists order_delivery_status_idx
  on public.order_delivery ("deliveryStatus");

-- ============================================================
-- complaints — 90-day window + status/channel/assignee filters
-- ============================================================

create index if not exists complaints_opened_at_desc_idx
  on public.complaints ("openedAt" desc);

create index if not exists complaints_status_idx
  on public.complaints ("status");

create index if not exists complaints_channel_idx
  on public.complaints ("channel");

create index if not exists complaints_assigned_to_idx
  on public.complaints ("assignedTo");

-- Linked-order lookup (complaints on an order)
create index if not exists complaints_linked_order_id_idx
  on public.complaints ("linkedOrderId");

-- ============================================================
-- products — targeted-stats hot path
-- ============================================================

-- Partial index: only rows we actually query (small subset)
create index if not exists products_is_targeted_partial_idx
  on public.products (id)
  where "isTargeted" = true;

-- ============================================================
-- tasks — bell polling + per-user views
-- ============================================================

create index if not exists tasks_created_at_desc_idx
  on public.tasks ("createdAt" desc);

create index if not exists tasks_assigned_to_idx
  on public.tasks ("assignedTo");

-- ============================================================
-- daily_briefings — bell polling reads the most recent
-- ============================================================

create index if not exists daily_briefings_created_at_desc_idx
  on public.daily_briefings ("createdAt" desc);

-- ============================================================
-- edit_history — order timeline + audit views
-- ============================================================

create index if not exists edit_history_order_id_changed_at_idx
  on public.edit_history ("orderId", "changedAt" desc);

-- ============================================================
-- customers / customer_addresses — CRM lookups
-- ============================================================

-- Phone-based lookup in POST /api/orders (existing customer resolution)
create index if not exists customers_phone_idx
  on public.customers ("phone");

-- Reverse lookup: all addresses for a customer
create index if not exists customer_addresses_customer_id_idx
  on public.customer_addresses ("customerId");

-- Done. Re-run any time; nothing above is destructive.
