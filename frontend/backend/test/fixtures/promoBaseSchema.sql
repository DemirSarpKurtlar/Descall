-- Minimal stand-ins for the production tables the promo migration touches (column names and
-- types copied from production's catalog, including users.created_at/last_seen being timestamp
-- without time zone). Test databases only.
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
  descoin_frozen boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'),
  last_seen timestamp without time zone
);
CREATE TABLE public.shop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  price_descoin integer,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  acquired_via text NOT NULL,
  gifted_by uuid,
  gift_message text,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  UNIQUE (user_id, item_id)
);
ALTER TABLE public.user_inventory ADD CONSTRAINT user_inventory_acquired_via_check
  CHECK (acquired_via IN ('purchase','gift','voucher'));
CREATE TABLE public.descoin_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  balance_after integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  message text,
  notified_at timestamptz
);
-- Production's current list (no 'shop_refund', no 'promo').
ALTER TABLE public.descoin_ledger ADD CONSTRAINT descoin_ledger_reason_check CHECK (reason IN (
  'voice_activity','screenshare_activity','message_activity','shop_purchase','admin_grant','admin_revoke',
  'referral_invite','referral_welcome','daily_claim','streak_bonus'));
