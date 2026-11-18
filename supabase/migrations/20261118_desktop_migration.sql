-- Desktop migration (Electron -> Tauri 2): rollout config and readiness / outcome reports.
-- Additive only: two new tables, nothing else changes. Written and read by the backend
-- (service role) only; RLS on with no policies, no anon/authenticated access.
-- The backend works without this migration (config stays OFF, reports kept in memory).
-- Reverse: drop table public.desktop_migration_reports; drop table public.desktop_migration_config;

create table if not exists public.desktop_migration_config (
  id text primary key default 'default' check (id = 'default'),
  -- lib/desktopMigration.js DEFAULT_CONFIG: killSwitch, percent, allowlist, minWinBuild,
  -- salt, migrator {url,sha256,size}, setup {url,sha256,size,version,args}, ...
  -- Re-validated on every read; an empty object means everything OFF.
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.desktop_migration_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references public.users (id) on delete set null,
  install_id text not null check (char_length(install_id) between 8 and 64),
  migration_id text check (migration_id is null or char_length(migration_id) between 8 and 64),
  event text not null check (event in (
    'offered', 'unsupported_os', 'downloaded', 'handoff_ok', 'handoff_failed', 'started',
    'done', 'skipped', 'rollback_ok', 'rollback_failed', 'needs_help', 'cleanup_done', 'cleanup_failed'
  )),
  step text,
  code text check (code is null or char_length(code) <= 80),
  duration_ms integer,
  strategy text check (strategy is null or strategy in ('in_place', 'side_by_side')),
  per_machine boolean,
  resumes integer,
  win_build integer,
  app_version text,
  electron_version text,
  steps jsonb not null default '[]'::jsonb
);

create index if not exists desktop_migration_reports_created_idx on public.desktop_migration_reports (created_at desc);
create index if not exists desktop_migration_reports_event_idx on public.desktop_migration_reports (event, created_at desc);
create index if not exists desktop_migration_reports_user_idx on public.desktop_migration_reports (user_id, created_at desc);

alter table public.desktop_migration_config enable row level security;
alter table public.desktop_migration_reports enable row level security;
revoke all on table public.desktop_migration_config from anon, authenticated;
revoke all on table public.desktop_migration_reports from anon, authenticated;
