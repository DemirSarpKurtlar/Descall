-- "Şüpheli Davranışlar" admin tab: watch list, watch rules and rule alerts
-- (owner decisions 25.10.2026). Builds on the anti-bot tables of #275
-- (frontend/backend/db/descoinAntibotMigration.sql) but does NOT need them:
-- these tables only reference public.users.
--
-- Additive and idempotent: new tables + indexes only. Nothing touches
-- users.descoin_balance or descoin_ledger. RLS on with no policies: only the
-- backend (service role) reads or writes.
--
-- The only change to an existing object: if descoin_admin_audit already exists,
-- its action CHECK is widened (superset) so watch list actions can be audited.
-- No row can fail the wider check.
--
-- Retention: descoin_admin_alerts rows are deleted after 90 days by the
-- backend's daily retention job (same as descoin_risk_alerts).
--
-- Reverse: drop table public.descoin_admin_alerts, public.descoin_watch_rules,
--          public.descoin_watchlist;

create table if not exists public.descoin_watchlist (
  user_id    uuid primary key references public.users(id) on delete cascade,
  added_by   uuid references public.users(id) on delete set null,
  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.descoin_watch_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.descoin_watchlist(user_id) on delete cascade,
  kind          text not null check (kind in ('risk_above', 'held_above', 'new_link', 'cluster_join', 'new_signal')),
  threshold     integer check (threshold is null or threshold between 0 and 10000000),
  created_at    timestamptz not null default now(),
  last_fired_at timestamptz,
  fired_key     text check (fired_key is null or char_length(fired_key) <= 200)
);
create index if not exists idx_descoin_watch_rules_user on public.descoin_watch_rules (user_id);

create table if not exists public.descoin_admin_alerts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  rule_id    uuid references public.descoin_watch_rules(id) on delete set null,
  kind       text not null check (char_length(kind) <= 40),
  severity   text not null check (severity in ('hi', 'mid', 'lo')),
  body       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists idx_descoin_admin_alerts_created on public.descoin_admin_alerts (created_at desc);
create index if not exists idx_descoin_admin_alerts_user on public.descoin_admin_alerts (user_id, created_at desc);

alter table public.descoin_watchlist    enable row level security;
alter table public.descoin_watch_rules  enable row level security;
alter table public.descoin_admin_alerts enable row level security;
revoke all on table public.descoin_watchlist, public.descoin_watch_rules, public.descoin_admin_alerts from anon, authenticated;

do $$
begin
  if to_regclass('public.descoin_admin_audit') is not null then
    alter table public.descoin_admin_audit drop constraint if exists descoin_admin_audit_action_check;
    alter table public.descoin_admin_audit add constraint descoin_admin_audit_action_check
      check (action in ('trust', 'untrust', 'note', 'run_job', 'release', 'watch_add', 'watch_update', 'watch_remove'));
  end if;
end $$;
