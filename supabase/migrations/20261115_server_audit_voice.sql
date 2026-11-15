-- Server audit 2026-11-15 (voice): additive only. The backend works without it
-- (server mute / deafen then live in memory only, no user limit, the AFK scanner
-- clears a dangling afk_channel_id itself).

-- V3 / SK-1: moderator server mute / deafen stay on the member (Discord parity)
-- until a moderator lifts them; they survive leave + re-join and moves.
alter table public.server_members
  add column if not exists voice_muted boolean not null default false,
  add column if not exists voice_deafened boolean not null default false;

-- V12: optional per-channel user limit for voice channels (0 = unlimited).
alter table public.server_channels
  add column if not exists user_limit smallint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'server_channels_user_limit_range'
      and conrelid = 'public.server_channels'::regclass
  ) then
    alter table public.server_channels
      add constraint server_channels_user_limit_range check (user_limit between 0 and 99);
  end if;
end $$;

-- V8 / SC-5: deleting the AFK channel used to leave a dangling id that broke the AFK
-- scanner. Clear orphans, then let the database null it on delete.
update public.servers s
   set afk_channel_id = null
 where afk_channel_id is not null
   and not exists (select 1 from public.server_channels c where c.id = s.afk_channel_id);

do $$
begin
  if not exists (
    select 1
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
     where con.conrelid = 'public.servers'::regclass
       and con.contype = 'f'
       and att.attname = 'afk_channel_id'
  ) then
    alter table public.servers
      add constraint servers_afk_channel_id_fkey
      foreign key (afk_channel_id) references public.server_channels(id) on delete set null;
  end if;
end $$;
