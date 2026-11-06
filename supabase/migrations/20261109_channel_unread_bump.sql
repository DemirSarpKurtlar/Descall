-- Server channel unread bump in one statement (performance review P2, 2026-11-09).
--
-- Every channel message used to read server_channel_reads for all viewers and then
-- write one UPDATE (read-then-write: concurrent messages lost increments) or one
-- INSERT per viewer. The INSERT sent last_read_at = null into a NOT NULL column, so
-- members who had never opened the channel got no unread count at all.
--
-- bump_channel_unread adds 1 to unread_count of p_channel_id for every user in
-- p_user_ids, creating missing rows with unread_count 1 and the column default for
-- last_read_at. Atomic per row (ON CONFLICT DO UPDATE on the primary key).
--
-- Only the backend (service role) calls it: execute is revoked from public, anon
-- and authenticated. The backend falls back to per-row writes while this function
-- does not exist yet.

create or replace function public.bump_channel_unread(p_channel_id uuid, p_user_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with bumped as (
    insert into public.server_channel_reads as r (user_id, channel_id, unread_count)
    select distinct u.user_id, p_channel_id, 1
    from unnest(p_user_ids) as u(user_id)
    where u.user_id is not null and p_channel_id is not null
    on conflict (user_id, channel_id)
    do update set unread_count = greatest(r.unread_count, 0) + 1
    returning 1
  )
  select count(*)::integer from bumped;
$$;

revoke all on function public.bump_channel_unread(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.bump_channel_unread(uuid, uuid[]) to service_role;
