-- Creates a public Storage bucket for order/complaint image attachments and
-- the minimal RLS policies needed for the app's anon-key client to upload to
-- it and for uploaded images to be viewable via their public URL.
-- Run once in the Supabase SQL editor.

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

create policy "attachments_public_read"
on storage.objects for select
using (bucket_id = 'attachments');

create policy "attachments_anon_upload"
on storage.objects for insert
with check (bucket_id = 'attachments');
