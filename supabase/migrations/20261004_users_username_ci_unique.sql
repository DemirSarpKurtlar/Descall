-- Usernames can now be changed from Settings (2.9.100). The API already checks
-- uniqueness case-insensitively; this index makes the database enforce it too,
-- so two simultaneous renames can never end up as "Demir" and "demir".
-- Safe to run more than once. If case-only duplicates already exist, it skips
-- creating the index and lists them so they can be fixed first.
DO $$
DECLARE
  dupes text;
BEGIN
  SELECT string_agg(lower(username), ', ')
    INTO dupes
    FROM (
      SELECT lower(username) AS username
        FROM public.users
       GROUP BY lower(username)
      HAVING count(*) > 1
    ) d;

  IF dupes IS NOT NULL THEN
    RAISE NOTICE 'Skipped users_username_lower_key: case-only duplicate usernames exist: %', dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON public.users (lower(username));
  END IF;
END $$;
