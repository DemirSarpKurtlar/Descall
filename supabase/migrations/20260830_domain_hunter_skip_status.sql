-- Domain Hunter: allow quality-filter SKIP status (profanity / slurs).
-- Additive check-constraint update only. No purchase / registrar columns.

alter table public.domain_hunter_candidates
  drop constraint if exists domain_hunter_candidates_status_check;

alter table public.domain_hunter_candidates
  add constraint domain_hunter_candidates_status_check
  check (status in ('new', 'strong_buy', 'buy', 'watch', 'tracked', 'registered', 'error', 'skip'));
