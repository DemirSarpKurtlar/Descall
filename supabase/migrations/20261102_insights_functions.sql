-- Faz 3 (3.7.5): Elde tutma + DesCoin ekonomisi (Yönetici Paneli).
-- Read-only helpers for the admin insights routes (service role only).
-- Nothing is stored; no existing table is changed.

-- One row per (account, local day) the account did something: opened the
-- app, sent a message, earned activity DesCoin, or was marked active.
create or replace function public.admin_activity_days(p_since date, p_tz text default 'Europe/Istanbul')
returns table (user_id uuid, day date)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct a.user_id, a.day from (
    select d.user_id, d.day from public.user_active_days d where d.day >= p_since
    union all
    select e.user_id, (e.occurred_at at time zone p_tz)::date
      from public.analytics_events e
      where e.user_id is not null
        and e.event in ('session_started', 'app_opened', 'login', 'first_session')
        and e.occurred_at >= (p_since::timestamp at time zone p_tz)
    union all
    select m.from_user_id, (m.created_at at time zone p_tz)::date
      from public.dm_messages m where m.created_at >= (p_since::timestamp at time zone p_tz)
    union all
    select g.sender_id, (g.created_at at time zone p_tz)::date
      from public.group_messages g where g.created_at >= (p_since::timestamp at time zone p_tz)
    union all
    select s.sender_id, (s.created_at at time zone p_tz)::date
      from public.server_messages s where s.created_at >= (p_since::timestamp at time zone p_tz)
    union all
    select l.user_id, (l.created_at at time zone p_tz)::date
      from public.descoin_ledger l
      where l.reason in ('message_activity', 'voice_activity', 'screenshare_activity', 'daily_claim')
        and l.created_at >= (p_since::timestamp at time zone p_tz)
  ) a
  where a.user_id is not null and a.day >= p_since;
$$;

-- DesCoin flow per local day and reason since a date.
create or replace function public.admin_descoin_flow(p_since date, p_tz text default 'Europe/Istanbul')
returns table (day date, reason text, minted bigint, spent bigint, entries bigint, accounts bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select (l.created_at at time zone p_tz)::date as day,
         l.reason,
         coalesce(sum(l.amount) filter (where l.amount > 0), 0)::bigint as minted,
         coalesce(-sum(l.amount) filter (where l.amount < 0), 0)::bigint as spent,
         count(*)::bigint as entries,
         count(distinct l.user_id)::bigint as accounts
    from public.descoin_ledger l
   where l.created_at >= (p_since::timestamp at time zone p_tz)
   group by 1, 2;
$$;

revoke all on function public.admin_activity_days(date, text) from public, anon, authenticated;
revoke all on function public.admin_descoin_flow(date, text) from public, anon, authenticated;
grant execute on function public.admin_activity_days(date, text) to service_role;
grant execute on function public.admin_descoin_flow(date, text) to service_role;
