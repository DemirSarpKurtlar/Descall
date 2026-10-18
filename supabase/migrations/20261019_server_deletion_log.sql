-- 2.11.19: audit row for a deleted server that survives the delete.
-- server_audit_logs.server_id references servers ON DELETE CASCADE, so the
-- SERVER_DELETE row was removed together with the server it described.
-- Additive only: a new table without a foreign key to servers. Written by the
-- backend (service role) only; RLS on with no policies, no anon/authenticated access.
-- Reverse: drop table public.server_deletion_log;
create table if not exists public.server_deletion_log (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null,
  server_name text,
  owner_id uuid,
  actor_id uuid,
  via text not null default 'delete',
  member_count integer,
  channel_count integer,
  message_count integer,
  private_media_removed integer,
  created_at timestamptz not null default now()
);

create index if not exists server_deletion_log_server_id_idx on public.server_deletion_log (server_id);
create index if not exists server_deletion_log_actor_id_idx on public.server_deletion_log (actor_id, created_at desc);

alter table public.server_deletion_log enable row level security;
revoke all on table public.server_deletion_log from anon, authenticated;
