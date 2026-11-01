-- 3D world, Oyun odasi: points-only results and leaderboards for the table games
-- (okey, blackjack, tavla, chess). See docs/design/3d-world/GAMES_PROTOCOL.md.
--
-- NOT APPLIED YET. The table manager is not wired into sockets; this file is the
-- proposed schema for the wiring phase.
--
-- Points are a score only: no money, chips, stakes, prizes or DesCoin anywhere.
-- Scope: a leaderboard belongs to the group (group call) or the server (voice
-- channel) the world room lives in, per game.
--
-- RLS stays on with no anon/authenticated grants: the backend (service role) is
-- the only reader and writer; clients get leaderboards through the API / socket.

-- One finished match or game (okey match, tavla match, chess game) or one
-- blackjack session (a table's lifetime) in a world room.
create table if not exists public.world_game_sessions (
  id uuid primary key default gen_random_uuid(),
  scope_kind text not null,
  scope_id text not null,
  room_key text not null,
  game text not null,
  table_id text not null,
  options jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint world_game_sessions_scope_check check (scope_kind in ('group', 'server')),
  constraint world_game_sessions_game_check check (game in ('okey', 'blackjack', 'tavla', 'chess'))
);

create index if not exists world_game_sessions_scope_idx
  on public.world_game_sessions (scope_kind, scope_id, game, ended_at desc);

-- Per player result of a session. Bots are not stored (user_id is a real user).
--   points  okey: final match score; tavla: match points; chess: 1 / 0.5 / 0;
--           blackjack: net session points (can be negative).
--   outcome win | loss | draw | none (blackjack sessions, aborted games)
create table if not exists public.world_game_results (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.world_game_sessions (id) on delete cascade,
  user_id uuid not null,
  game text not null,
  seat smallint,
  points numeric(12, 1) not null default 0,
  outcome text not null default 'none',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint world_game_results_outcome_check check (outcome in ('win', 'loss', 'draw', 'none')),
  constraint world_game_results_game_check check (game in ('okey', 'blackjack', 'tavla', 'chess')),
  constraint world_game_results_unique unique (session_id, user_id)
);

create index if not exists world_game_results_user_idx on public.world_game_results (user_id, created_at desc);

-- Running totals per scope, game and user (what the leaderboard panel reads).
create table if not exists public.world_game_leaderboard (
  scope_kind text not null,
  scope_id text not null,
  game text not null,
  user_id uuid not null,
  played integer not null default 0,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  points numeric(14, 1) not null default 0,
  best numeric(12, 1) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope_kind, scope_id, game, user_id),
  constraint world_game_leaderboard_scope_check check (scope_kind in ('group', 'server')),
  constraint world_game_leaderboard_game_check check (game in ('okey', 'blackjack', 'tavla', 'chess'))
);

create index if not exists world_game_leaderboard_rank_idx
  on public.world_game_leaderboard (scope_kind, scope_id, game, points desc);

alter table public.world_game_sessions enable row level security;
alter table public.world_game_results enable row level security;
alter table public.world_game_leaderboard enable row level security;

revoke all on public.world_game_sessions from anon, authenticated;
revoke all on public.world_game_results from anon, authenticated;
revoke all on public.world_game_leaderboard from anon, authenticated;

-- Record a finished session atomically: the session row, one result per player
-- and the leaderboard increments. p_results is a JSON array of
--   { "user_id": uuid, "seat": int, "points": number, "outcome": text, "details": {} }
-- Idempotent per (session id, user): a retried call does not count twice.
create or replace function public.world_game_record_session(
  p_session_id uuid,
  p_scope_kind text,
  p_scope_id text,
  p_room_key text,
  p_game text,
  p_table_id text,
  p_options jsonb,
  p_summary jsonb,
  p_started_at timestamptz,
  p_results jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  inserted integer := 0;
  v_user uuid;
  v_points numeric;
  v_outcome text;
begin
  insert into public.world_game_sessions (id, scope_kind, scope_id, room_key, game, table_id, options, summary, started_at, ended_at)
  values (p_session_id, p_scope_kind, p_scope_id, p_room_key, p_game, p_table_id, coalesce(p_options, '{}'::jsonb), coalesce(p_summary, '{}'::jsonb), coalesce(p_started_at, now()), now())
  on conflict (id) do nothing;

  for r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    v_user := (r ->> 'user_id')::uuid;
    v_points := coalesce((r ->> 'points')::numeric, 0);
    v_outcome := coalesce(r ->> 'outcome', 'none');
    insert into public.world_game_results (session_id, user_id, game, seat, points, outcome, details)
    values (p_session_id, v_user, p_game, (r ->> 'seat')::smallint, v_points, v_outcome, coalesce(r -> 'details', '{}'::jsonb))
    on conflict (session_id, user_id) do nothing;
    if found then
      inserted := inserted + 1;
      insert into public.world_game_leaderboard as lb (scope_kind, scope_id, game, user_id, played, wins, draws, losses, points, best, updated_at)
      values (
        p_scope_kind, p_scope_id, p_game, v_user, 1,
        (v_outcome = 'win')::int, (v_outcome = 'draw')::int, (v_outcome = 'loss')::int,
        v_points, greatest(v_points, 0), now()
      )
      on conflict (scope_kind, scope_id, game, user_id) do update set
        played = lb.played + 1,
        wins = lb.wins + excluded.wins,
        draws = lb.draws + excluded.draws,
        losses = lb.losses + excluded.losses,
        points = lb.points + excluded.points,
        best = greatest(lb.best, excluded.best),
        updated_at = now();
    end if;
  end loop;
  return inserted;
end;
$$;

revoke all on function public.world_game_record_session(uuid, text, text, text, text, text, jsonb, jsonb, timestamptz, jsonb) from public, anon, authenticated;
