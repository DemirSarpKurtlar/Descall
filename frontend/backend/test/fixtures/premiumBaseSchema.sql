-- Extra stand-ins for the premium migration, loaded after promoBaseSchema.sql (test databases only):
-- users.email exists in production, and Supabase's auth.uid() is what the own-row RLS policies use.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
