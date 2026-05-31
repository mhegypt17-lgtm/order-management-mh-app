-- Chat messages table for the in-app chat between CS / Branch / Admin.
-- Run this once in the Supabase SQL editor.

create table if not exists public.chat_messages (
  id          text primary key,
  role        text not null check (role in ('cs', 'branch', 'admin')),
  author      text not null,
  text        text not null,
  "createdAt" timestamptz not null default now()
);

create index if not exists chat_messages_created_idx
  on public.chat_messages ("createdAt" desc);

-- Allow the anon key (used by the app's API routes) to read/insert.
alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_select_all" on public.chat_messages;
create policy "chat_messages_select_all"
  on public.chat_messages for select
  using (true);

drop policy if exists "chat_messages_insert_all" on public.chat_messages;
create policy "chat_messages_insert_all"
  on public.chat_messages for insert
  with check (true);
