-- 3.7.14 Geri bildirim A: the sender can read the team's answers and reply.
-- New optional columns on public.user_feedback (no data rewrite):
--   kind               suggestion | bug | praise (what the user picked; category stays for the panel)
--   rating             1-5 stars (praise / overall experience)
--   details            { area, frequency, likes[] } from the new form
--   user_last_read_at  when the sender last opened the thread (unread badge)
-- RLS stays on with no anon/authenticated grants: the backend (service role) is the only reader.
alter table public.user_feedback add column if not exists kind text;
alter table public.user_feedback add column if not exists rating smallint;
alter table public.user_feedback add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.user_feedback add column if not exists user_last_read_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_feedback_kind_check') then
    alter table public.user_feedback add constraint user_feedback_kind_check
      check (kind is null or kind in ('suggestion', 'bug', 'praise'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_feedback_rating_check') then
    alter table public.user_feedback add constraint user_feedback_rating_check
      check (rating is null or rating between 1 and 5);
  end if;
end $$;

-- Existing rows: kind from the category, and everything already sent counts as read.
update public.user_feedback
   set kind = case category when 'bug' then 'bug' when 'improvement' then 'praise' else 'suggestion' end
 where kind is null;
update public.user_feedback set user_last_read_at = coalesce(updated_at, now()) where user_last_read_at is null;

create index if not exists user_feedback_user_updated_idx on public.user_feedback (user_id, updated_at desc);
