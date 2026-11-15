-- Server audit 2026-11-15, membership fixes (routes/servers.js, lib/serverMemberState.js).
-- Additive only. The code works before this runs: every new table / column is read
-- with a fallback (missing table or column = old behaviour).
--
-- 1. server_member_timeouts: a timeout outlives the membership row, so leave + rejoin
--    no longer clears it (audit M3 / IM-1). server_members.timeout_until stays the fast
--    copy that message / reaction / typing / voice checks read; a rejoin copies a
--    running timeout back from here.
-- 2. servers.invites_paused_at: platform "Close invites" pauses every join path
--    (invite, vanity, public discover, directory) until staff reopen it (IM-4).
-- 3. servers.default_notification_level: notification level new members start with
--    (SC-10).
-- 4. Setting channel columns get ON DELETE SET NULL foreign keys (NOT VALID: existing
--    rows are not checked, new writes and channel deletes are). The route also clears
--    them (SC-5).
--
-- Rollback:
--   drop table if exists public.server_member_timeouts;
--   alter table public.servers drop column if exists invites_paused_at,
--     drop column if exists default_notification_level;
--   alter table public.servers drop constraint if exists servers_afk_channel_fk,
--     drop constraint if exists servers_system_channel_fk,
--     drop constraint if exists servers_welcome_channel_fk;

create table if not exists public.server_member_timeouts (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  until timestamptz not null,
  reason text,
  moderator_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create index if not exists idx_server_member_timeouts_until
  on public.server_member_timeouts (until);

alter table public.server_member_timeouts enable row level security;
revoke all on table public.server_member_timeouts from anon, authenticated;

-- Running timeouts of current members are carried over.
insert into public.server_member_timeouts (server_id, user_id, until, reason, moderator_id)
select m.server_id, m.user_id, m.timeout_until, m.timeout_reason, m.timed_out_by
from public.server_members m
where m.timeout_until is not null and m.timeout_until > now()
on conflict (server_id, user_id) do nothing;

alter table public.servers
  add column if not exists invites_paused_at timestamptz,
  add column if not exists default_notification_level text not null default 'all';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'servers_default_notification_level_check') then
    alter table public.servers
      add constraint servers_default_notification_level_check
      check (default_notification_level in ('all', 'mentions')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'servers_afk_channel_fk') then
    alter table public.servers
      add constraint servers_afk_channel_fk foreign key (afk_channel_id)
      references public.server_channels(id) on delete set null not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'servers_system_channel_fk') then
    alter table public.servers
      add constraint servers_system_channel_fk foreign key (system_channel_id)
      references public.server_channels(id) on delete set null not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'servers_welcome_channel_fk') then
    alter table public.servers
      add constraint servers_welcome_channel_fk foreign key (welcome_channel_id)
      references public.server_channels(id) on delete set null not valid;
  end if;
end $$;
