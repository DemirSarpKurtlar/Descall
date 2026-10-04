-- user_presence.user_id pointed at auth.users, but Descall uses its own
-- public.users table (auth.users is empty), so every presence upsert failed
-- with user_presence_user_id_fkey. Point the FK at public.users instead.
alter table public.user_presence
  drop constraint if exists user_presence_user_id_fkey;

delete from public.user_presence p
where not exists (select 1 from public.users u where u.id = p.user_id);

alter table public.user_presence
  add constraint user_presence_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;

-- Same problem on the activity history and settings tables: history inserts
-- and privacy saves failed silently. Repoint both at public.users too.
alter table public.user_activity_log
  drop constraint if exists user_activity_log_user_id_fkey;
delete from public.user_activity_log l
where not exists (select 1 from public.users u where u.id = l.user_id);
alter table public.user_activity_log
  add constraint user_activity_log_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;

alter table public.user_activity_settings
  drop constraint if exists user_activity_settings_user_id_fkey;
delete from public.user_activity_settings s
where not exists (select 1 from public.users u where u.id = s.user_id);
alter table public.user_activity_settings
  add constraint user_activity_settings_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;
