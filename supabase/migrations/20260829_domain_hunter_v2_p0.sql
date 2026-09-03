-- Domain Hunter V2 P0: two-signal availability metadata + single running scan claim.
-- Additive only. No purchase / registrar columns.

alter table public.domain_hunter_candidates
  add column if not exists availability_confidence integer,
  add column if not exists availability_source text,
  add column if not exists dns_status text;

create index if not exists idx_domain_hunter_candidates_avail_conf
  on public.domain_hunter_candidates (available, availability_confidence);

-- Fail scans stuck in 'running' before enforcing a single-runner claim.
update public.domain_hunter_scan_runs
set
  status = 'failed',
  finished_at = coalesce(finished_at, now()),
  error_detail = coalesce(nullif(error_detail, ''), 'stale running scan (stuck)')
where status = 'running';

-- Only one scan_runs row may be 'running' at a time (cron + in-process overlap).
create unique index if not exists domain_hunter_scan_runs_one_running
  on public.domain_hunter_scan_runs (status)
  where status = 'running';
