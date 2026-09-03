-- Domain Hunter: autonomous domain discovery/scoring pipeline.
-- Accessed only via the backend's Supabase service-role client, so RLS is
-- enabled with no anon/authenticated policies (locked down by default).

create table if not exists public.domain_hunter_candidates (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  root text not null,
  tld text not null,
  keyword text,
  source text,
  pattern text,
  available boolean,
  check_error text,
  expires_at timestamptz,
  score integer not null default 0 check (score >= 0 and score <= 100),
  estimated_value_low integer default 0,
  estimated_value_high integer default 0,
  brandability_score integer default 0,
  commercial_potential_score integer default 0,
  trend_strength_score integer default 0,
  trademark_risk text default 'LOW' check (trademark_risk in ('LOW', 'MEDIUM', 'HIGH')),
  trademark_flags jsonb default '[]'::jsonb,
  status text default 'new' check (status in ('new', 'strong_buy', 'buy', 'watch', 'tracked', 'registered', 'error')),
  is_opportunity boolean default false,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_domain_hunter_candidates_score on public.domain_hunter_candidates (score desc);
create index if not exists idx_domain_hunter_candidates_next_check on public.domain_hunter_candidates (next_check_at);
create index if not exists idx_domain_hunter_candidates_available on public.domain_hunter_candidates (available);
create index if not exists idx_domain_hunter_candidates_opportunity on public.domain_hunter_candidates (is_opportunity);
create index if not exists idx_domain_hunter_candidates_first_seen on public.domain_hunter_candidates (first_seen_at desc);

alter table public.domain_hunter_candidates enable row level security;

create table if not exists public.domain_hunter_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null unique,
  source text,
  discovered_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count integer not null default 0,
  active boolean not null default true
);

create index if not exists idx_domain_hunter_keywords_last_used on public.domain_hunter_keywords (last_used_at nulls first);

alter table public.domain_hunter_keywords enable row level security;

create table if not exists public.domain_hunter_scan_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  keywords_discovered integer default 0,
  domains_generated integer default 0,
  domains_checked integer default 0,
  available_found integer default 0,
  new_opportunities integer default 0,
  api_errors integer default 0,
  error_detail text,
  stage_results jsonb default '{}'::jsonb
);

create index if not exists idx_domain_hunter_scan_runs_started on public.domain_hunter_scan_runs (started_at desc);

alter table public.domain_hunter_scan_runs enable row level security;

create table if not exists public.domain_hunter_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  scan_interval_minutes integer not null default 60,
  updated_at timestamptz not null default now()
);

insert into public.domain_hunter_settings (id, enabled, scan_interval_minutes)
values (1, true, 60)
on conflict (id) do nothing;

alter table public.domain_hunter_settings enable row level security;
