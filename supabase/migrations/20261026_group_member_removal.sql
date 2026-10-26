-- Group member removal + group admin role (Oct 2026, owner decisions 25.10.2026).
-- Additive and idempotent: one new nullable-default column, one new table.
-- Nothing existing is changed or dropped. Written by the backend (service role)
-- only; RLS on with no policies, no anon/authenticated access.
--
--   group_members.role       'member' (default) | 'admin'. The owner stays
--                            groups.created_by; role is ignored for the owner.
--   group_member_removals    one row per removal: who removed whom, optional
--                            reason (shown only to the removed person), and
--                            read_until (the removed person keeps reading
--                            history up to that moment). dismissed_at = the
--                            removed person tapped "Sohbetten kaldır";
--                            readded_at = they were added back.
--
-- Reverse: drop table public.group_member_removals;
--          alter table public.group_members drop column role;

alter table public.group_members add column if not exists role text not null default 'member';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'group_members_role_check'
      and conrelid = 'public.group_members'::regclass
  ) then
    alter table public.group_members
      add constraint group_members_role_check check (role in ('member', 'admin'));
  end if;
end $$;

create table if not exists public.group_member_removals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  removed_by uuid references public.users(id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 140),
  removed_at timestamptz not null default now(),
  read_until timestamptz not null default now(),
  dismissed_at timestamptz,
  readded_at timestamptz
);

create index if not exists group_member_removals_user_idx
  on public.group_member_removals (user_id, removed_at desc);
create index if not exists group_member_removals_group_user_idx
  on public.group_member_removals (group_id, user_id, removed_at desc);

alter table public.group_member_removals enable row level security;
revoke all on table public.group_member_removals from anon, authenticated;
