-- Messaging phase 4: per-conversation notification options. Additive only.
--
-- One row per (user, DM peer or group):
--   level        'all' | 'mentions' | 'none'   (no row = 'all')
--   muted_until  nothing notifies before this time (null = not muted)
-- Pushes are filtered by backend/lib/notifyPrefs.js; the app filters its own
-- desktop / in-app notifications. The old DM "Mute" switch
-- (dm_conversation_prefs.muted) keeps working next to it.
-- Before this runs every conversation counts as 'all' and saving answers
-- 503 not_ready.

create table if not exists public.conversation_notify_prefs (
  user_id uuid not null references public.users(id) on delete cascade,
  conv_type text not null check (conv_type in ('dm', 'group')),
  conv_id uuid not null,
  level text not null default 'all' check (level in ('all', 'mentions', 'none')),
  muted_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, conv_type, conv_id)
);

-- The backend uses the service role; nothing reads this table with a user key.
alter table public.conversation_notify_prefs enable row level security;
