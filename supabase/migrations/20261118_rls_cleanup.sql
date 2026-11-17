-- Security scan 17 Nov 2026 (backend-security-13): RLS and advisor cleanup.
-- REVIEW BEFORE APPLYING (coordinator / owner). Not applied by the scan agents.
--
-- 1. public.reactions carries four permissive policies that allow everything
--    (USING true / WITH CHECK true) next to the correct per-user ones. Permissive
--    policies are OR-ed, so today they are harmless only because anon and
--    authenticated have no table grants; one GRANT (for example for Realtime)
--    would let anyone with the publishable key read, add, change or delete any
--    reaction. The backend uses the service role and never relies on them.
-- 2. Three functions have a role-mutable search_path (advisor 0011).
-- 3. Four indexes are exact duplicates of another index on the same table.
--
-- Every statement is idempotent (IF EXISTS); the app works before and after.

begin;

-- 1. Allow-everything policies on reactions (the scoped policies stay:
--    reactions_select_dm, reactions_select_group, reactions_insert, reactions_delete).
drop policy if exists reactions_select_all on public.reactions;
drop policy if exists reactions_insert_own on public.reactions;
drop policy if exists reactions_delete_own on public.reactions;
drop policy if exists reactions_update_own on public.reactions;

-- 2. Pin search_path on the flagged functions.
alter function public.admin_audit_append_only() set search_path = public, pg_temp;
alter function public.subscription_events_append_only() set search_path = public, pg_temp;
alter function public.access_ban_touch(uuid) set search_path = public, pg_temp;

-- 3. Duplicate indexes (the twin with the same definition stays).
drop index if exists public.idx_announcements_is_active; -- = idx_announcements_active (is_active)
drop index if exists public.idx_error_logs_timestamp;    -- = idx_error_logs_time ("timestamp" desc)
drop index if exists public.idx_friendships_friend_id;   -- = idx_friendships_friend (friend_id)
drop index if exists public.idx_friendships_user_id;     -- = idx_friendships_user (user_id)

commit;
