-- Adds reply-to-message and role-mention support to chat_messages.
-- Run this once in the Supabase SQL editor (safe to re-run, all guarded).

alter table public.chat_messages
  add column if not exists "replyToId"     text,
  add column if not exists "replyToAuthor" text,
  add column if not exists "replyToText"   text,
  add column if not exists "mentions"      text[];

-- Helps the server-side reply lookup (select author/text by id) stay fast.
create index if not exists chat_messages_reply_to_id_idx
  on public.chat_messages ("replyToId");
