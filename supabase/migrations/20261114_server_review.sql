-- Sunucu inceleme (Yönetici Paneli, section serverReview, Nov 2026).
-- Additive only: one new column with a constant default and two read-only helper
-- functions. Nothing is dropped, rewritten or backfilled. NOT applied by the change
-- that adds it: the owner reviews and applies it in Supabase.
--
-- 1. Edit history for server channel messages, the same retention as direct messages.
--    public.dm_messages.edit_history (20260806_persist_dm_messages.sql) keeps the text a
--    DM had before each edit as [{ "text": ..., "editedAt": ... }]; server messages
--    overwrote content on edit and kept nothing. With this column the edit handler
--    (socket/serverChannelHandlers.js, server:channel:message:edit) appends the
--    previous text the same way (last 50 versions). Deleted messages are still
--    removed for good, exactly like deleted DMs (no copy is kept for either).
--    Only the admin "Sunucu inceleme" channel view (purpose + reason + step-up +
--    audit) reads this column; every member-facing select names its columns and
--    never includes it.
--
-- 2. admin_server_overview(): per-server counts for the admin server list (members,
--    7-day joins, channels, 7 / 30-day message volume, last message, live invites,
--    invite uses) in one call instead of scanning whole tables from the backend.
--    admin_server_channel_stats(): message count and last activity per channel of one
--    server. Counts only, never message text. Service role only (no anon /
--    authenticated execute), like admin_activity_days in 20261102_insights_functions.sql.
--
-- The backend tolerates this migration not being applied: edit history reads as empty
-- and edits keep working without it, and the admin list falls back to capped scans
-- (marked "approximate" in the panel).
--
-- Reverse:
--   drop function if exists public.admin_server_channel_stats(uuid);
--   drop function if exists public.admin_server_overview(timestamptz, timestamptz);
--   alter table public.server_messages drop column if exists edit_history;

alter table public.server_messages
  add column if not exists edit_history jsonb not null default '[]'::jsonb;

create or replace function public.admin_server_overview(p_since7 timestamptz, p_since30 timestamptz)
returns table (
  server_id uuid,
  members bigint,
  joins_7d bigint,
  channels bigint,
  msgs_7d bigint,
  msgs_30d bigint,
  last_message_at timestamptz,
  invites_active bigint,
  invite_uses bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    s.id,
    (select count(*) from public.server_members m where m.server_id = s.id),
    (select count(*) from public.server_members m where m.server_id = s.id and m.joined_at >= p_since7),
    (select count(*) from public.server_channels c where c.server_id = s.id and c.type <> 'category'),
    (select count(*) from public.server_messages x where x.server_id = s.id and x.created_at >= p_since7),
    (select count(*) from public.server_messages x where x.server_id = s.id and x.created_at >= p_since30),
    (select max(x.created_at) from public.server_messages x where x.server_id = s.id),
    (select count(*) from public.server_invites i
       where i.server_id = s.id
         and (i.expires_at is null or i.expires_at > now())
         and (i.max_uses is null or i.uses < i.max_uses)),
    (select coalesce(sum(i.uses), 0) from public.server_invites i where i.server_id = s.id)
  from public.servers s;
$$;

create or replace function public.admin_server_channel_stats(p_server_id uuid)
returns table (channel_id uuid, messages bigint, last_message_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select x.channel_id, count(*)::bigint, max(x.created_at)
    from public.server_messages x
   where x.server_id = p_server_id
   group by x.channel_id;
$$;

revoke all on function public.admin_server_overview(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_server_channel_stats(uuid) from public, anon, authenticated;
