-- Messaging phase 4: "Görüldü" read receipts. Additive only.
--
-- 1. users.read_receipts: the privacy switch (Settings > Privacy > Messages).
--    Default on. Off works both ways: the user's reads are not reported and
--    they see no one else's (backend/lib/readReceipts.js).
-- 2. group_read_state: how far each member has read a group (one row per
--    member, written by the group:mark_read socket event). "Görüldü: Ayşe,
--    Mert" under my last group message compares it with that message's time.
-- DMs keep using dm_messages.read_at.
-- The backend works before this runs: everyone counts as "on" and group reads
-- are simply not stored.

alter table public.users
  add column if not exists read_receipts boolean not null default true;

create table if not exists public.group_read_state (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- The backend uses the service role; nothing reads this table with a user key.
alter table public.group_read_state enable row level security;
