-- 2.13.3: scheduled maintenance windows (admin "Bakım" tab) and their audit log.
-- Additive only: two new tables, no change to existing tables or rows.
-- Written and read by the backend (service role) only; RLS on with no
-- policies, no anon/authenticated access.
-- Reverse: drop table public.maintenance_audit; drop table public.maintenance_windows;
create table if not exists public.maintenance_windows (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  title text not null,
  message text not null,
  kind text not null default 'planned' check (kind in ('planned', 'emergency')),
  platforms text[] not null default array['web','electron','ios','android'],
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  original_ends_at timestamptz,
  announce_minutes integer check (announce_minutes is null or announce_minutes between 1 and 1440),
  admins_bypass boolean not null default true,
  notify_on_end boolean not null default false,
  ended_at timestamptz,
  end_notified_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancelled_by_username text,
  cancel_reason text,
  created_by uuid,
  created_by_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_windows_range check (ends_at > starts_at)
);

create unique index if not exists maintenance_windows_seq_key on public.maintenance_windows (seq);
create index if not exists maintenance_windows_starts_at_idx on public.maintenance_windows (starts_at desc);

create table if not exists public.maintenance_audit (
  id bigint generated always as identity primary key,
  window_id uuid not null references public.maintenance_windows (id) on delete cascade,
  action text not null,
  actor_id uuid,
  actor_username text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists maintenance_audit_window_idx on public.maintenance_audit (window_id, created_at desc);

alter table public.maintenance_windows enable row level security;
alter table public.maintenance_audit enable row level security;
revoke all on table public.maintenance_windows from anon, authenticated;
revoke all on table public.maintenance_audit from anon, authenticated;
