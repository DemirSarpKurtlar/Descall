-- Invite growth (Nov 2026): which invite a sign-up came from. Additive only.
--
-- A logged-out visitor on an invite landing (/servers/join/:code, /s/:slug, /invite/:code)
-- presses "Join with a free account"; register / Google / Apple sign-up send the code
-- (backend/lib/signupInvite.js) and the new account records it here, so conversions can be
-- counted per invite and per server. referred_by (existing column) is set to the invite's
-- creator when still empty.
-- The backend works before this runs: the two columns are skipped when they are missing.

alter table public.users
  add column if not exists signup_invite_kind text,
  add column if not exists signup_invite_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_signup_invite_kind_check'
  ) then
    alter table public.users
      add constraint users_signup_invite_kind_check
      check (signup_invite_kind is null or signup_invite_kind in ('server', 'vanity', 'group'));
  end if;
end $$;

create index if not exists users_signup_invite_code_idx
  on public.users (signup_invite_kind, signup_invite_code)
  where signup_invite_code is not null;
