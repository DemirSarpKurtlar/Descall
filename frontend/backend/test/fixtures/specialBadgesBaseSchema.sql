-- Minimal stand-in for the production users table the special-badge migration references
-- (types copied from production's catalog). Test databases only. When the promo fixture
-- exists (promoBaseSchema.sql) the harness loads that one instead, it is a superset.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  display_name text,
  avatar_url text,
  is_admin boolean DEFAULT false,
  is_banned boolean DEFAULT false,
  deleted_at timestamptz,
  descoin_balance integer NOT NULL DEFAULT 0,
  created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'),
  last_seen timestamp without time zone
);
