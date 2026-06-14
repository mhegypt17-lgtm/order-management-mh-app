-- CS-side attachments on the orders row.
--
-- Captures CS-uploaded images (e.g. proof of bank transfer, customer ID
-- copy, payment receipt screenshots) so they're associated with the order
-- record. Each entry in the JSONB array has shape:
--   { id, url, caption, uploadedBy, uploadedAt }
-- where `url` is a base64 data URL (same approach used for the existing
-- branch productPhotos / invoicePhoto columns on order_delivery).
--
-- The API code is defensive — if this migration hasn't been run yet the
-- POST/PUT endpoints will retry the write without csAttachments and the
-- order will still save (only the attachments will be lost).
--
-- Safe to re-run.

alter table public.orders
  add column if not exists "csAttachments" jsonb not null default '[]'::jsonb;
