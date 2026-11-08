-- Public server directory (item 8, Nov 2026). Additive only: new nullable / defaulted
-- columns on public.servers, check constraints and one partial index. Nothing is
-- dropped or rewritten, existing rows keep listed_in_directory = false.
--
-- Why a new flag instead of is_public: is_public already means "shown in in-app
-- discovery to signed-in users" (Community & Discovery). The directory is published on
-- the open web (descall.com/communities, /tr/topluluklar) and indexed by search engines,
-- so owners opt in separately.
--
-- The backend (frontend/backend/lib/serverDirectory.js) tolerates this migration not
-- being applied: directory reads answer an empty list, owner saves answer 503.
--
-- Columns:
--   listed_in_directory      owner / ADMINISTRATOR opt-in
--   directory_category       one of the categories below (required while listed)
--   directory_language       main language of the server (required while listed)
--   directory_description    public blurb, at most 300 characters
--   directory_tags           at most 5 tags of at most 24 characters
--   directory_listed_at      when the server was last listed ("newest" sort)
--   directory_invite_code    the reusable invite the directory join button hands out
--   directory_hidden_at      set by Descall moderation: never shown while set
--   directory_hidden_reason  moderation note (staff only, never public)
--
-- Reverse:
--   drop index if exists public.idx_servers_directory;
--   alter table public.servers
--     drop constraint if exists servers_directory_category_check,
--     drop constraint if exists servers_directory_language_check,
--     drop constraint if exists servers_directory_description_check,
--     drop constraint if exists servers_directory_tags_check,
--     drop column if exists listed_in_directory, drop column if exists directory_category,
--     drop column if exists directory_language, drop column if exists directory_description,
--     drop column if exists directory_tags, drop column if exists directory_listed_at,
--     drop column if exists directory_invite_code, drop column if exists directory_hidden_at,
--     drop column if exists directory_hidden_reason;

alter table public.servers
  add column if not exists listed_in_directory boolean not null default false,
  add column if not exists directory_category text,
  add column if not exists directory_language text,
  add column if not exists directory_description text,
  add column if not exists directory_tags text[] not null default '{}'::text[],
  add column if not exists directory_listed_at timestamptz,
  add column if not exists directory_invite_code text,
  add column if not exists directory_hidden_at timestamptz,
  add column if not exists directory_hidden_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'servers_directory_category_check') then
    alter table public.servers add constraint servers_directory_category_check check (
      directory_category is null or directory_category in (
        'gaming-minecraft', 'gaming-fps', 'gaming-cs2', 'gaming-lol', 'gaming-other',
        'study', 'music', 'art', 'tech', 'anime', 'sports', 'chat-friends', 'other'
      )
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'servers_directory_language_check') then
    alter table public.servers add constraint servers_directory_language_check check (
      directory_language is null or directory_language in ('tr', 'en', 'de', 'es', 'fr', 'pt-BR', 'ru', 'other')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'servers_directory_description_check') then
    alter table public.servers add constraint servers_directory_description_check check (
      directory_description is null or char_length(directory_description) <= 300
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'servers_directory_tags_check') then
    -- Tag characters and the 24-character limit are checked by the backend (a check
    -- constraint cannot look inside the array with a subquery); 5 tags x 24 characters
    -- also bound the joined length here.
    alter table public.servers add constraint servers_directory_tags_check check (
      cardinality(directory_tags) <= 5
      and char_length(array_to_string(directory_tags, ',')) <= 124
    );
  end if;
end
$$;

-- Directory reads: listed servers, newest listing first.
create index if not exists idx_servers_directory
  on public.servers (directory_listed_at desc)
  where listed_in_directory = true;
