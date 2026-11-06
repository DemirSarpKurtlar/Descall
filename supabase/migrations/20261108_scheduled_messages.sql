-- Messaging phase 4: scheduled sending. Additive only.
--
-- A text message to a DM, group or server channel that the server sends at
-- send_at, also when the author is offline (backend/lib/scheduledMessages.js,
-- checked every 15 s). The author can edit content / send_at or cancel while
-- status = 'pending'. Instances claim a row with
--   update ... set status = 'sending' where id = ? and status = 'pending'
-- so it goes out once. A row stuck in 'sending' is marked 'failed', never
-- re-sent. Before this runs the API answers 503 not_ready.

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  conv_type text not null check (conv_type in ('dm', 'group', 'channel')),
  conv_id uuid not null,
  content text not null check (char_length(content) between 1 and 4000),
  send_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  error text,
  message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

-- The sender's due scan.
create index if not exists scheduled_messages_due_idx
  on public.scheduled_messages (send_at)
  where status = 'pending';

-- "My scheduled messages" (per chat).
create index if not exists scheduled_messages_user_idx
  on public.scheduled_messages (user_id, status, conv_type, conv_id);

-- The backend uses the service role; nothing reads this table with a user key.
alter table public.scheduled_messages enable row level security;
