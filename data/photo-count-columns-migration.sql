-- Egress fix (Round 5): the "light" single-order GET (CS + branch, when
-- photos are NOT requested) was selecting the FULL base64 csAttachments /
-- productPhotos / invoicePhoto blobs from Postgres just to compute a count
-- or boolean (Array.isArray(arr) && arr.length > 0). That still transfers
-- every photo byte from Postgres -> Node on every single order-detail open
-- (the highest-frequency action in the app), even though the bytes are then
-- stripped before the JSON response goes to the browser.
--
-- These generated/stored columns let Postgres maintain the count/boolean
-- automatically on every write, so the "how many photos are saved" check
-- becomes a cheap int/bool read instead of a full-blob transfer. Purely
-- additive — never touches or replaces the existing csAttachments /
-- productPhotos / invoicePhoto columns or their data.
--
-- Defensive CASE (instead of a bare jsonb_array_length call): if any legacy
-- row ever has non-array JSON in these columns, jsonb_array_length() would
-- throw and fail the whole migration. The CASE falls back to 0 instead.

alter table public.orders
  add column if not exists "csAttachmentsCount" integer
  generated always as (
    case when jsonb_typeof(coalesce("csAttachments", '[]'::jsonb)) = 'array'
         then jsonb_array_length(coalesce("csAttachments", '[]'::jsonb))
         else 0
    end
  ) stored;

alter table public.order_delivery
  add column if not exists "productPhotosCount" integer
  generated always as (
    case when jsonb_typeof(coalesce("productPhotos", '[]'::jsonb)) = 'array'
         then jsonb_array_length(coalesce("productPhotos", '[]'::jsonb))
         else 0
    end
  ) stored;

alter table public.order_delivery
  add column if not exists "hasInvoicePhoto" boolean
  generated always as (
    "invoicePhoto" is not null and "invoicePhoto" <> ''
  ) stored;
