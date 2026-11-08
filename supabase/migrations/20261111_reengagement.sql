-- Re-engagement (item 4). Additive only: one new table and two new users columns.
-- Nothing existing is altered, dropped or rewritten. Apply manually.
--
-- The backend (lib/reengage*.js) works before this runs: the "friend is in
-- voice" push and the lifecycle / activity emails are simply not sent (no
-- place to store the sent markers), the two switches read as their defaults
-- and saving them answers 503 not_ready.
--
-- Everything is also behind REENGAGE_ENABLED (default off) and REENGAGE_DRY_RUN.

-- Settings > Notifications > "Friend is in voice". Default on.
-- Off: no "<friend> is in voice in <server>" push for this account.
alter table public.users
  add column if not exists notify_friend_voice boolean not null default true;

-- Set by the one-click unsubscribe link in any re-engagement email, or by the
-- "Email notifications" switch. Not null: no friend-request / server-invite
-- fallback emails and no lifecycle (day 3 / day 7) emails. Security and sign-in
-- emails are not affected.
alter table public.users
  add column if not exists email_notify_opt_out_at timestamptz;

-- One row per message the re-engagement code sent (or claimed before sending).
-- unique (user_id, kind) is the idempotency key, so a restart or a second
-- instance can never send the same message twice:
--   'day3' / 'day7'                       lifecycle emails, once per account
--   'friend_request_email:<YYYY-MM-DD>'   at most one per Istanbul day
--   'server_invite_email:<YYYY-MM-DD>'    at most one per Istanbul day
--   'friend_voice:<6 hour slot>'          the friend-in-voice push (also 6 h / 3 a day)
-- status: 'claimed' (row written, send in flight), 'sent', 'failed' (not retried).
create table if not exists public.lifecycle_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (char_length(kind) between 3 and 64),
  channel text not null default 'email' check (channel in ('email', 'push')),
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'failed')),
  meta jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  constraint lifecycle_messages_user_kind_key unique (user_id, kind)
);

create index if not exists lifecycle_messages_sent_at_idx on public.lifecycle_messages (sent_at);
create index if not exists lifecycle_messages_user_sent_idx on public.lifecycle_messages (user_id, sent_at);

-- Written and read only by the backend (service role). No policies on purpose.
alter table public.lifecycle_messages enable row level security;
revoke all on public.lifecycle_messages from anon, authenticated;
