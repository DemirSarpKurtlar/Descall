-- Additive product-update list. Apply manually. Do not drop or alter existing tables.
-- No anon policies: the service role bypasses RLS; the public API never exposes the table.

create table if not exists public.marketing_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text,
  consent_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  confirm_token text,
  unsubscribe_token text,
  constraint marketing_subscribers_email_key unique (email)
);

alter table public.marketing_subscribers enable row level security;
