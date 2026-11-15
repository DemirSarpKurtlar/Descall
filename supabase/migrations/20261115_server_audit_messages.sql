-- Server audit 2026-11-15, MESSAGES (server-audit/messages.md, sockets.md SK-5).
-- Additive only. The backend works before this runs: it detects the missing table and
-- keeps slowmode in memory only.
--
-- 1. server_slowmode_marks: last send time per (channel, user) for channel slowmode
--    (MSG-11). Slowmode read the sender's newest stored message, so deleting it reset
--    the timer; game posts were never stored at all (MSG-8). The backend upserts a row
--    after every send in a slowmode channel and reads it next to the newest message.
--    Service role only: RLS on, no policies.
-- 2. Size guards (MSG-5 / MSG-9 / SK-5), NOT VALID so existing rows are not checked:
--    server message text at most 20 000 characters (the admin maximum of
--    maxMessageLength), a reaction at most 64 characters.

create table if not exists public.server_slowmode_marks (
  channel_id uuid not null references public.server_channels(id) on delete cascade,
  user_id uuid not null,
  last_sent_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

alter table public.server_slowmode_marks enable row level security;
revoke all on table public.server_slowmode_marks from anon, authenticated;
grant all on table public.server_slowmode_marks to service_role;

create index if not exists server_slowmode_marks_last_sent_idx
  on public.server_slowmode_marks (last_sent_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'server_messages_content_len_chk'
  ) then
    alter table public.server_messages
      add constraint server_messages_content_len_chk
      check (content is null or char_length(content) <= 20000) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'reactions_emoji_len_chk'
  ) then
    alter table public.reactions
      add constraint reactions_emoji_len_chk
      check (emoji is null or char_length(emoji) <= 64) not valid;
  end if;
end $$;
