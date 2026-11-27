-- Public server page "Vitrin" (descall.com/s/<slug>) and its owner control desk
-- (UI-BRIEF draft A, owner items 22 and 23). Additive only, safe to re-run.
--
-- servers.public_page_*   owner settings. OFF by default: the page exists (and is
--                         indexable) only after the owner turns on "Google'da göster".
--   public_page_enabled          the switch
--   public_page_enabled_at       when it was last turned on
--   public_page_title            Google result title (empty: "<name> · Descall")
--   public_page_description      Google result description (empty: server description)
--   public_page_hidden           section keys the owner hid (banner, desc, tags, count,
--                                chan, ev, rules, pin); name and icon are always shown
--   public_page_hidden_channels  channel ids left out of the public channel list (hidden
--                                and role-locked channels are never shown anyway)
--   public_page_pin              owner highlight ("Sabit duyuru"), plain text
--   public_page_updated_at       last save (og:image / sitemap version)
--   public_page_disabled_at      last time it was turned off
--   public_page_disabled_reason  why (season_break, too_many_joins, raid, other)
--   public_page_undo_until       the 10-minute undo window after turning it off
--   public_page_last_crawl_at    last time a search engine crawler fetched the page
-- server_public_events      owner-entered upcoming events (shown on the page, JSON-LD
--                           Event, Google date rows). At most 5 per server (backend).
-- server_public_page_daily  per day and traffic source: page views, join clicks and
--                           joins that started on the page. Written only through
--                           server_public_page_bump (atomic increments from every node).
--
-- Only the backend reads and writes them with the service role: RLS on, no policies,
-- no anon / authenticated grants. Until this is applied the backend answers the
-- public page as "off" and owner saves answer 503 (lib/serverPublicPage.js).
--
-- Reverse:
--   drop function if exists public.server_public_page_bump(uuid, date, text, integer, integer, integer);
--   drop table if exists public.server_public_page_daily;
--   drop table if exists public.server_public_events;
--   alter table public.servers drop constraint if exists servers_public_page_title_check,
--     drop constraint if exists servers_public_page_description_check,
--     drop constraint if exists servers_public_page_pin_check,
--     drop constraint if exists servers_public_page_hidden_check,
--     drop constraint if exists servers_public_page_reason_check,
--     drop column if exists public_page_enabled, drop column if exists public_page_enabled_at,
--     drop column if exists public_page_title, drop column if exists public_page_description,
--     drop column if exists public_page_hidden, drop column if exists public_page_hidden_channels,
--     drop column if exists public_page_pin, drop column if exists public_page_updated_at,
--     drop column if exists public_page_disabled_at, drop column if exists public_page_disabled_reason,
--     drop column if exists public_page_undo_until, drop column if exists public_page_last_crawl_at;

alter table public.servers
  add column if not exists public_page_enabled boolean not null default false,
  add column if not exists public_page_enabled_at timestamptz,
  add column if not exists public_page_title text,
  add column if not exists public_page_description text,
  add column if not exists public_page_hidden text[] not null default '{}'::text[],
  add column if not exists public_page_hidden_channels text[] not null default '{}'::text[],
  add column if not exists public_page_pin text,
  add column if not exists public_page_updated_at timestamptz,
  add column if not exists public_page_disabled_at timestamptz,
  add column if not exists public_page_disabled_reason text,
  add column if not exists public_page_undo_until timestamptz,
  add column if not exists public_page_last_crawl_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'servers_public_page_title_check') then
    alter table public.servers add constraint servers_public_page_title_check
      check (public_page_title is null or char_length(public_page_title) <= 70);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'servers_public_page_description_check') then
    alter table public.servers add constraint servers_public_page_description_check
      check (public_page_description is null or char_length(public_page_description) <= 170);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'servers_public_page_pin_check') then
    alter table public.servers add constraint servers_public_page_pin_check
      check (public_page_pin is null or char_length(public_page_pin) <= 280);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'servers_public_page_hidden_check') then
    alter table public.servers add constraint servers_public_page_hidden_check
      check (cardinality(public_page_hidden) <= 16 and cardinality(public_page_hidden_channels) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'servers_public_page_reason_check') then
    alter table public.servers add constraint servers_public_page_reason_check
      check (public_page_disabled_reason is null
        or public_page_disabled_reason in ('season_break', 'too_many_joins', 'raid', 'other'));
  end if;
end
$$;

-- Sitemap / crawler reads: enabled pages only.
create index if not exists idx_servers_public_page
  on public.servers (public_page_updated_at desc)
  where public_page_enabled = true;

create table if not exists public.server_public_events (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  starts_at timestamptz not null,
  ends_at timestamptz,
  place text check (place is null or char_length(place) <= 60),
  created_by uuid,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index if not exists idx_server_public_events_server
  on public.server_public_events (server_id, starts_at);

create table if not exists public.server_public_page_daily (
  server_id uuid not null references public.servers(id) on delete cascade,
  day date not null,
  source text not null check (source in (
    'google', 'bing', 'yandex', 'duckduckgo', 'whatsapp', 'telegram', 'x', 'instagram',
    'facebook', 'reddit', 'discord', 'youtube', 'tiktok', 'descall', 'qr', 'direct', 'other'
  )),
  views integer not null default 0 check (views >= 0),
  join_clicks integer not null default 0 check (join_clicks >= 0),
  joins integer not null default 0 check (joins >= 0),
  updated_at timestamptz not null default now(),
  primary key (server_id, day, source)
);

create index if not exists idx_server_public_page_daily_day
  on public.server_public_page_daily (day desc);

create or replace function public.server_public_page_bump(
  p_server uuid, p_day date, p_source text, p_views integer, p_join_clicks integer, p_joins integer
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.server_public_page_daily (server_id, day, source, views, join_clicks, joins, updated_at)
  values (p_server, p_day, p_source, greatest(p_views, 0), greatest(p_join_clicks, 0), greatest(p_joins, 0), now())
  on conflict (server_id, day, source) do update set
    views = public.server_public_page_daily.views + excluded.views,
    join_clicks = public.server_public_page_daily.join_clicks + excluded.join_clicks,
    joins = public.server_public_page_daily.joins + excluded.joins,
    updated_at = now();
$$;

alter table public.server_public_events enable row level security;
alter table public.server_public_page_daily enable row level security;
revoke all on public.server_public_events from anon, authenticated;
revoke all on public.server_public_page_daily from anon, authenticated;
revoke all on function public.server_public_page_bump(uuid, date, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.server_public_page_bump(uuid, date, text, integer, integer, integer) to service_role;

comment on table public.server_public_events is
  'Owner-entered upcoming events of a public server page (descall.com/s/<slug>). Service role only.';
comment on table public.server_public_page_daily is
  'Public server page counters per day and traffic source (views, join clicks, joins). Service role only.';
