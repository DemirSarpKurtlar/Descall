-- get_user_friends is SECURITY DEFINER and returns friend usernames for any
-- user id. Postgres grants EXECUTE to PUBLIC by default, so the anon key
-- could call it through PostgREST even after the 20261010 revoke from
-- anon/authenticated (that revoke does not remove the PUBLIC grant).
-- The API uses the service role and does not call this function.

REVOKE ALL ON FUNCTION public.get_user_friends(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_friends(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_friends(uuid) TO service_role;
