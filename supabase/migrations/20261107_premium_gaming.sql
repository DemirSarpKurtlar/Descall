-- Descall+ / Ultra gaming (phase 1). Additive only.
-- Game session history and the activity timeline reuse public.user_activity_log
-- (app_type = 'game'); no new session table. This adds:
--  1. the game status card visibility per user (everyone | friends | nobody),
--  2. an index for the per-user game history range query (/api/premium/gaming/sessions).

alter table public.user_activity_settings
  add column if not exists game_card text not null default 'friends';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_activity_settings_game_card_check'
      and conrelid = 'public.user_activity_settings'::regclass
  ) then
    alter table public.user_activity_settings
      add constraint user_activity_settings_game_card_check
      check (game_card in ('everyone', 'friends', 'nobody'));
  end if;
end $$;

create index if not exists user_activity_log_user_type_started_idx
  on public.user_activity_log (user_id, app_type, started_at desc);
