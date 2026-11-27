-- Growth phase 3B "Önce insanlar": people-first notifications, friend win-back,
-- shared streaks + daily tasks, weekly digest and the admin re-engagement console.
-- Additive only: new tables, new nullable / defaulted columns, new indexes.
-- Nothing existing is altered, dropped or rewritten. Apply manually; never on prod
-- from a branch. The backend (lib/reengage/*) works before this runs: every read
-- falls back to defaults and every write answers 503 not_ready.
--
-- Sending stays behind REENGAGE_ENABLED / REENGAGE_DRY_RUN (default off). The console
-- mode override below is null by default, so nothing changes until an owner picks it.

-- 1. Notification center: one row per account (types, quiet hours, voice budget).
create table if not exists public.notify_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  -- { friendVoice, mentions, unread, streak, digest } booleans; missing = on.
  types jsonb not null default '{}'::jsonb,
  -- Quiet hours (local time of the account). The system rule 23:00-09:00 always
  -- applies on top; the account may only widen it.
  quiet_start smallint not null default 23 check (quiet_start between 18 and 23),
  quiet_end smallint not null default 9 check (quiet_end between 9 and 12),
  -- Sessiz saatte mesajlar da sessiz gelsin (DM / group / mention pushes arrive without sound).
  quiet_messages boolean not null default false,
  -- "Seste" pushes per day: 1..3 (the system cap stays 3, 6 h apart).
  voice_daily_max smallint not null default 3 check (voice_daily_max between 1 and 3),
  -- Weekly digest e-mail day (0 = Sunday) and local hour.
  digest_day smallint not null default 0 check (digest_day between 0 and 6),
  digest_hour smallint not null default 11 check (digest_hour between 9 and 21),
  updated_at timestamptz not null default now()
);

-- 2. Per person: important people (max 8, enforced by the backend), voice / message
-- levels, quiet-hour break, shared-streak nudges, the main button on the push.
-- Message level "never" and "Sustur" also write conversation_notify_prefs (dm:<peer>),
-- so the existing per-DM mute keeps working everywhere.
create table if not exists public.notify_person_prefs (
  user_id uuid not null references public.users(id) on delete cascade,
  peer_id uuid not null references public.users(id) on delete cascade,
  important boolean not null default false,
  important_at timestamptz,
  voice text not null default 'default' check (voice in ('always', 'default', 'off')),
  messages text not null default 'always' check (messages in ('always', 'away', 'never')),
  break_quiet boolean not null default false,
  nudges boolean not null default true,
  primary_action text not null default 'join' check (primary_action in ('join', 'quiet_join')),
  muted_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, peer_id),
  constraint notify_person_prefs_not_self check (user_id <> peer_id)
);
create index if not exists notify_person_prefs_important_idx on public.notify_person_prefs (user_id) where important;
create index if not exists notify_person_prefs_peer_idx on public.notify_person_prefs (peer_id);

-- 3. "Kişiye göre en iyi saat": local hours an account was active (one row per hour).
create table if not exists public.user_activity_hours (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  hour smallint not null check (hour between 0 and 23),
  primary key (user_id, day, hour)
);
create index if not exists user_activity_hours_day_idx on public.user_activity_hours (day);

-- 4. Arkadaştan çağrı: day-7 suggestion to the closest friend, the call, the return
-- and the reward. episode_key = "<target>:<first absent day>" makes one suggestion per
-- absence; rewards are paid once per call (descoin_ledger meta idempotencyKey).
create table if not exists public.winback_calls (
  id uuid primary key default gen_random_uuid(),
  episode_key text not null,
  caller_id uuid not null references public.users(id) on delete cascade,
  target_id uuid not null references public.users(id) on delete cascade,
  server_id uuid,
  reason jsonb not null default '{}'::jsonb,
  message text,
  status text not null default 'suggested'
    check (status in ('suggested', 'dismissed', 'called', 'returned', 'rewarded', 'denied', 'expired')),
  suggested_at timestamptz not null default now(),
  called_at timestamptz,
  returned_at timestamptz,
  active_seconds integer not null default 0,
  rewarded_at timestamptz,
  reward_amount integer not null default 0,
  deny_reason text,
  expires_at timestamptz,
  constraint winback_calls_episode_key unique (episode_key),
  constraint winback_calls_not_self check (caller_id <> target_id)
);
create index if not exists winback_calls_caller_idx on public.winback_calls (caller_id, called_at);
create index if not exists winback_calls_target_idx on public.winback_calls (target_id, called_at);
create index if not exists winback_calls_status_idx on public.winback_calls (status, suggested_at);

-- 14-day e-mail gift: claimed automatically on the first sign-in within 72 h.
create table if not exists public.winback_gifts (
  user_id uuid not null references public.users(id) on delete cascade,
  episode_key text not null,
  amount integer not null check (amount between 1 and 1000),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  primary key (user_id, episode_key)
);

-- 5. Ortak seri: a streak two friends keep together (user_a < user_b).
create table if not exists public.shared_streaks (
  user_a uuid not null references public.users(id) on delete cascade,
  user_b uuid not null references public.users(id) on delete cascade,
  count integer not null default 0,
  best integer not null default 0,
  last_day date,
  a_day date,
  b_day date,
  a_nudged_day date,
  b_nudged_day date,
  started_by uuid,
  started_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'ended')),
  primary key (user_a, user_b),
  constraint shared_streaks_order check (user_a < user_b)
);
create index if not exists shared_streaks_b_idx on public.shared_streaks (user_b);

-- Daily tasks (three a day, each about one person). Paid once per slot from facts the
-- server counted itself (a DM to that person, minutes in voice with a friend).
create table if not exists public.daily_tasks (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  slot smallint not null check (slot between 1 and 3),
  kind text not null check (kind in ('message', 'save_streak', 'voice')),
  target_id uuid,
  reward integer not null default 0,
  progress integer not null default 0,
  goal integer not null default 1,
  done_at timestamptz,
  paid_amount integer not null default 0,
  primary key (user_id, day, slot)
);

-- 6. Console: campaigns, waves, settings.
create table if not exists public.reengage_campaigns (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  kind text not null,
  status text not null default 'draft' check (status in ('live', 'paused', 'draft', 'auto')),
  -- { "<lang>": { pushTitle, pushBody, emailSubject, emailBody, approved } }
  templates jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  holdout_pct smallint not null default 10 check (holdout_pct between 0 and 50),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.reengage_waves (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  label text,
  status text not null default 'running' check (status in ('running', 'done', 'recalled', 'cancelled')),
  audience integer not null default 0,
  sent integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  undo_until timestamptz,
  recalled_at timestamptz,
  recall_reason text,
  recall_note text,
  recalled_by uuid,
  created_by uuid,
  dry_run boolean not null default false
);
create index if not exists reengage_waves_campaign_idx on public.reengage_waves (campaign_id, started_at desc);

create table if not exists public.reengage_settings (
  id text primary key default 'default' check (id = 'default'),
  -- null = follow REENGAGE_ENABLED / REENGAGE_DRY_RUN; set by the console (owner only).
  mode_override text check (mode_override in ('off', 'dry_run', 'live')),
  paused boolean not null default false,
  call_reward integer not null default 50 check (call_reward between 0 and 200),
  gift14_amount integer not null default 150 check (gift14_amount between 0 and 500),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- 7. lifecycle_messages (20261111_reengagement.sql) learns about campaigns, waves and
-- the post-send tracking. Columns only; the existing unique (user_id, kind) key stays
-- the idempotency key.
alter table public.lifecycle_messages add column if not exists campaign text;
alter table public.lifecycle_messages add column if not exists wave_id uuid;
alter table public.lifecycle_messages add column if not exists lang text;
alter table public.lifecycle_messages add column if not exists holdout boolean not null default false;
alter table public.lifecycle_messages add column if not exists delivered_at timestamptz;
alter table public.lifecycle_messages add column if not exists opened_at timestamptz;
alter table public.lifecycle_messages add column if not exists returned_at timestamptz;
alter table public.lifecycle_messages add column if not exists return_kind text;
alter table public.lifecycle_messages add column if not exists recalled_at timestamptz;
create index if not exists lifecycle_messages_wave_idx on public.lifecycle_messages (wave_id) where wave_id is not null;
create index if not exists lifecycle_messages_campaign_idx on public.lifecycle_messages (campaign, sent_at) where campaign is not null;

-- Written and read only by the backend (service role). No policies on purpose.
alter table public.notify_settings enable row level security;
alter table public.notify_person_prefs enable row level security;
alter table public.user_activity_hours enable row level security;
alter table public.winback_calls enable row level security;
alter table public.winback_gifts enable row level security;
alter table public.shared_streaks enable row level security;
alter table public.daily_tasks enable row level security;
alter table public.reengage_campaigns enable row level security;
alter table public.reengage_waves enable row level security;
alter table public.reengage_settings enable row level security;
revoke all on public.notify_settings, public.notify_person_prefs, public.user_activity_hours,
  public.winback_calls, public.winback_gifts, public.shared_streaks, public.daily_tasks,
  public.reengage_campaigns, public.reengage_waves, public.reengage_settings from anon, authenticated;
