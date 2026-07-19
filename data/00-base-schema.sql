-- 00-base-schema.sql
-- ============================================================
-- Complete base schema for a FRESH Supabase project.
-- Idempotent — every statement uses IF NOT EXISTS, so re-running
-- this file on a partially-populated project is safe.
--
-- HOW TO RUN
-- ----------
-- 1. Create the new Supabase project (see steps in chat).
-- 2. Open the new project's SQL Editor → New query → paste this
--    ENTIRE file → click Run. Should finish in <5 seconds.
-- 3. Then run, in this order:
--       data/hot-query-indexes.sql          (Phase 2F.1)
--       data/orders-dashboard-v1-view.sql   (Phase 2F.2)
-- 4. Then import your 12 CSVs from TABLE BACKUP/ via the Supabase
--    Table Editor's built-in CSV importer (order matters — see chat).
-- 5. Update .env.local + Vercel env vars → redeploy.
--
-- DESIGN NOTES
-- ------------
-- * Column names are camelCase quoted to match TypeScript record types
--   in src/lib/omsData.ts and the existing migrations in data/*.sql.
-- * NO foreign-key constraints — historic CSVs may have orphan rows
--   (e.g. an order referencing a customer that was later deleted).
--   Application-level logic already handles referential integrity.
-- * NO row-level-security policies — the app uses the anon key for
--   client reads and the service_role key server-side, which bypasses
--   RLS anyway. Add strict RLS later if you introduce per-user auth.
-- * Timestamps use timestamptz (accepts both Supabase-export format
--   `2024-11-06 09:36:24+00` and app-written `2024-11-06T09:36:24.123Z`).
-- * jsonb is used for JSON payloads (settings blobs, attachments, comments).
-- * text[] is used for simple string arrays where CSV import round-trips
--   cleanly; jsonb is used where the array holds objects.
-- ============================================================


-- ============================================================
-- 1. product_categories  — parent for products
-- ============================================================
create table if not exists public.product_categories (
  id           text primary key,
  name         text not null,
  "sortOrder"  integer,
  "isActive"   boolean not null default true,
  "createdAt"  timestamptz not null default now(),
  "updatedAt"  timestamptz not null default now()
);


-- ============================================================
-- 2. products  — matches products_rows.csv + app-side fields
-- ============================================================
create table if not exists public.products (
  id                    text primary key,
  "productName"         text not null,
  "productDescription"  text,
  "bestRecipes"         text,
  "productCategory"     text,
  "fatRatioComments"    text,
  "isStandardPackage"   boolean,
  "packagingType"       text,
  "weightGrams"         numeric,
  "basePrice"           numeric,
  "offerPrice"          numeric,
  "buyingPrice"         numeric,          -- app field, may not be in CSV
  "unitPrice"           numeric,          -- app field, may not be in CSV
  category              text,             -- app field alias
  unit                  text,
  "imageUrl"            text,
  barcode               text,
  "hasDailyPriceChange" boolean,
  "isByReservation"     boolean,
  "productCondition"    text,
  "isActive"            boolean not null default true,
  "isTargeted"          boolean not null default false,
  "pricingMode"         text default 'unit',   -- 'unit' | 'weight'
  "stockStatus"         text,
  "stockQuantity"       numeric,
  "stockUpdatedAt"      timestamptz,
  "stockUpdatedBy"      text,
  "createdAt"           timestamptz not null default now(),
  "updatedAt"           timestamptz not null default now()
);


-- ============================================================
-- 3. customers  — matches customers_rows.csv + retention controls
-- ============================================================
create table if not exists public.customers (
  id                   text primary key,
  phone                text not null,
  "customerName"       text not null,
  email                text,
  notes                text,
  wallet               numeric default 0,
  status               text,          -- 'active' | 'warning' | 'suspended'
  "statusReason"       text,
  "statusUpdatedAt"    timestamptz,
  "statusUpdatedBy"    text,
  "doNotFollowUp"      boolean default false,
  "followUpSnoozeUntil" timestamptz,
  "createdAt"          timestamptz not null default now(),
  "updatedAt"          timestamptz not null default now()
);


-- ============================================================
-- 4. customer_addresses  — matches customer_addresses_rows.csv
-- ============================================================
create table if not exists public.customer_addresses (
  id               text primary key,
  "customerId"     text not null,
  "addressLabel"   text,
  area             text,
  "subArea"        text,
  "streetAddress"  text,
  "googleMapsLink" text,
  "createdAt"      timestamptz not null default now()
);


-- ============================================================
-- 5. delivery_zones  — matches delivery_zones_rows.csv
-- ============================================================
create table if not exists public.delivery_zones (
  id                    text primary key,
  zone                  integer,
  area                  text,
  "subArea"             text,
  "averageDistanceKm"   numeric,
  "deliveryCost"        numeric,
  "customerDeliveryFee" numeric,
  "freeDeliveryValue"   numeric,
  "createdAt"           timestamptz not null default now(),
  "updatedAt"           timestamptz not null default now()
);


-- ============================================================
-- 6. order_settings  — single-row config blob
-- ============================================================
create table if not exists public.order_settings (
  id                          text primary key,
  "orderReceivers"            jsonb,
  "orderMethods"              jsonb,
  "customerSources"           jsonb,
  "orderTypes"                jsonb,
  "paymentMethods"            jsonb,
  "orderStatuses"             jsonb,
  "complaintChannels"         jsonb,
  "complaintReasons"          jsonb,
  "monthlyCompensationBudget" numeric default 0,
  "monthlyTargetedUnitsGoal"  numeric default 0,
  "slaHours"                  numeric default 24,
  loyalty                     jsonb,
  retention                   jsonb,
  "agentNotice"               jsonb,
  "autoActivateThreshold"     numeric,
  "autoActivateEnabled"       boolean default false,
  "updatedAt"                 timestamptz not null default now()
);


-- ============================================================
-- 7. discount_codes
-- ============================================================
create table if not exists public.discount_codes (
  id               text primary key,
  code             text not null,
  type             text not null,           -- 'percent' | 'value'
  amount           numeric not null,
  "maxDiscount"    numeric,
  "minOrderTotal"  numeric,
  "isActive"       boolean not null default true,
  "expiresAt"      timestamptz,
  "usageLimit"     integer,
  "usedCount"      integer not null default 0,
  "createdAt"      timestamptz not null default now(),
  "updatedAt"      timestamptz not null default now()
);


-- ============================================================
-- 8. orders  — matches orders_rows.csv (35 columns)
-- ============================================================
create table if not exists public.orders (
  id                     text primary key,
  "appOrderNo"           text,
  "orderDate"            date,             -- YYYY-MM-DD
  "orderTime"            text,
  "orderType"            text,
  "orderReceiver"        text,
  "orderMethod"          text,
  "customerType"         text,
  "customerSource"       text,
  "orderStatus"          text,
  "cancellationReason"   text,
  "paymentMethod"        text,
  "customerId"           text,
  "deliveryAddressId"    text,
  notes                  text,
  "followUp"             boolean default false,
  "followUpNotes"        text,
  "isScheduled"          boolean default false,
  "scheduledDate"        date,
  "scheduledTimeSlot"    text,
  "scheduledSpecificTime" text,
  "isPriority"           boolean default false,
  "priorityReason"       text,
  subtotal               numeric default 0,
  "deliveryFee"          numeric default 0,
  "walletApplied"        numeric,          -- legacy CSV column
  "walletUsed"           numeric,          -- current app column
  "discountCode"         text,
  "discountApplied"      numeric,          -- legacy CSV column
  "discountAmount"       numeric,
  "orderTotal"           numeric default 0,
  "netTotal"             numeric,
  "csAttachments"        jsonb,
  "createdBy"            text,
  "createdAt"            timestamptz not null default now(),
  "updatedAt"            timestamptz not null default now()
);


-- ============================================================
-- 9. order_items  — matches order_items_rows.csv
-- ============================================================
create table if not exists public.order_items (
  id                     text primary key,
  "orderId"              text not null,
  "productId"            text not null,
  quantity               numeric,
  "weightGrams"          numeric,
  "unitPrice"            numeric,
  "lineTotal"            numeric,
  "specialInstructions"  text,
  "originalQuantity"     numeric,
  "originalWeightGrams"  numeric,
  "basePriceSnapshot"    numeric,
  "offerPriceSnapshot"   numeric,
  "createdAt"            timestamptz not null default now()
);


-- ============================================================
-- 10. order_delivery  — matches order_delivery_rows.csv + stage timings
-- ============================================================
create table if not exists public.order_delivery (
  id                  text primary key,
  "orderId"           text not null,
  "deliveryStatus"    text default 'لم يخرج بعد',
  "branchComments"    text,
  "productPhotos"     jsonb,             -- string[] of data URLs or storage paths
  "invoicePhoto"      text,              -- single data URL or storage path
  "deliveredAt"       timestamptz,
  "acceptedAt"        timestamptz,       -- from delivery-timing-migration
  "readyAt"           timestamptz,
  "outForDeliveryAt"  timestamptz,
  "updatedBy"         text,
  "updatedAt"         timestamptz not null default now()
);


-- ============================================================
-- 11. order_feedback  — matches order_feedback_rows.csv
-- ============================================================
create table if not exists public.order_feedback (
  id                      text primary key,
  "orderId"               text not null,
  "customerId"            text,
  rating                  integer,
  comment                 text,
  "collectedBy"           text,
  "collectedAt"           timestamptz,
  "contactChannel"        text,          -- 'phone' | 'whatsapp' | 'in-person' | 'other'
  "followUpRequired"      boolean default false,
  "escalatedComplaintId"  text,
  "productQuality"        text,
  packaging               text,
  "packagingOther"        text,
  "deliveryTimeliness"    text,
  "customerService"       text,
  "customerServiceOther"  text,
  "pricingValue"          text,
  "appUsability"          text,
  "recommendToFriends"    text,
  "createdAt"             timestamptz not null default now(),
  "updatedAt"             timestamptz not null default now()
);


-- ============================================================
-- 12. edit_history  — matches edit_history_rows.csv
-- ============================================================
create table if not exists public.edit_history (
  id            text primary key,
  "entityType"  text not null,           -- 'order' | 'delivery' | 'product'
  "entityId"    text not null,
  "orderId"     text,
  action        text not null,           -- 'created' | 'updated' | 'deleted' | 'status_changed'
  "changedBy"   text,
  "changedAt"   timestamptz not null default now(),
  summary       text,
  details       jsonb
);


-- ============================================================
-- 13. chat_messages  — used by ChatButton (empty in fresh project)
-- ============================================================
create table if not exists public.chat_messages (
  id          text primary key,
  role        text not null,             -- 'cs' | 'branch' | 'admin'
  author      text not null,
  text        text not null,
  "createdAt" timestamptz not null default now()
);


-- ============================================================
-- 14. tasks  — used by TaskList + NotificationBell (empty)
-- ============================================================
create table if not exists public.tasks (
  id                 text primary key,
  title              text not null,
  description        text,
  "assignedTo"       text,
  "linkedOrderId"    text,
  "linkedCustomerId" text,
  source             text,
  status             text default 'جديدة',
  priority           text default 'متوسطة',
  "dueDate"          timestamptz,
  "createdBy"        text,
  "createdAt"        timestamptz not null default now(),
  "updatedAt"        timestamptz not null default now()
);


-- ============================================================
-- 15. daily_briefings  — used by DailyBriefings + NotificationBell (empty)
-- ============================================================
create table if not exists public.daily_briefings (
  id            text primary key,
  "authorName"  text,
  "authorRole"  text,                    -- 'admin' | 'cs'
  message       text,
  type          text,                    -- 'announcement' | 'alert' | 'workingHours' | 'general'
  priority      text default 'medium',
  "isCompleted" boolean default false,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);


-- ============================================================
-- 16. complaints  — used by NotificationBell + /api/complaints (empty)
--                   — user intentionally skipped importing this CSV
-- ============================================================
create table if not exists public.complaints (
  id                    text primary key,
  "ticketNumber"        text,
  channel               text,
  subject               text,
  description           text,
  reason                text,
  status                text default 'open',   -- 'open' | 'in-progress' | 'closed'
  priority              text default 'medium',
  "customerId"          text,
  "customerName"        text,
  "customerPhone"       text,
  "linkedOrderId"       text,
  "assignedTo"          text,
  "createdBy"           text,
  "compensationAmount"  numeric default 0,
  "productIds"          jsonb,
  comments              jsonb,
  "openedAt"            timestamptz not null default now(),
  "closedAt"            timestamptz,
  "createdAt"           timestamptz not null default now(),
  "updatedAt"           timestamptz not null default now()
);


-- ============================================================
-- 17. adahi_orders  — seasonal, empty. Included so /api/adahi-orders
--     doesn't 500 on a fresh project.
-- ============================================================
create table if not exists public.adahi_orders (
  id                     text primary key,
  "seasonLabel"          text,
  "orderDate"            date,
  "orderTime"            text,
  "orderReceiver"        text,
  "orderMethod"          text,
  "customerId"           text,
  "customerName"         text,
  phone                  text,
  "deliveryAddressId"    text,
  "addressLabel"         text,
  "deliveryArea"         text,
  "subArea"              text,
  "streetAddress"        text,
  "googleMapsLink"       text,
  items                  jsonb,
  subtotal               numeric,
  "paidAmount"           numeric,
  "remainingAmount"      numeric,
  "collectionPercent"    numeric,
  "slaughterDay"         text,
  "cuttingDetails"       text,
  "cleanOffal"           boolean,
  "hasDelivery"          boolean,
  "willWitnessSacrifice" boolean,
  notes                  text,
  "createdBy"            text,
  "createdAt"            timestamptz not null default now(),
  "updatedAt"            timestamptz not null default now()
);


-- ============================================================
-- MINIMAL indexes on primary keys / hot filters. The full set of
-- performance indexes is in data/hot-query-indexes.sql — run that
-- AFTER importing the CSVs (indexes are cheaper to build over
-- fully-loaded tables in one shot).
-- ============================================================

-- Uniqueness that the app relies on:
create unique index if not exists customers_phone_uidx
  on public.customers ("phone");

create unique index if not exists order_delivery_orderid_uidx
  on public.order_delivery ("orderId");

create unique index if not exists order_feedback_orderid_uidx
  on public.order_feedback ("orderId");

-- Done.
