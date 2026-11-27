-- Davet Merkezi (growth phase 4, owner pick 4A, Nov 2026): invite rewards that unlock only
-- when the invited friend is really active, the personal invite dashboard, milestones,
-- anti-abuse and the admin "Davet ödülleri" control board. Backend: lib/referrals/*,
-- routes/invites.js, routes/adminInvites.js.
--
-- Before this migration a friend-link sign-up (/register?ref=<user>) paid 100 DesCoin to the
-- inviter and 50 to the invitee at once (referral_rewards row = paid). From now on the row is
-- written as 'pending' at sign-up and pays only after the invitee's first message AND a
-- return visit on a later day (24-72 h after sign-up by default, versioned rules below).
-- Rows that already exist were paid by the old logic: the new columns give them
-- status 'paid' and legacy = true through the column defaults (no UPDATE of old rows), and
-- the defaults are switched to the new values right after, so nothing already paid is
-- touched or paid twice.
--
-- Every DesCoin movement goes through lib/descoin.js with an idempotency key in the ledger
-- meta ("referral:<referral id>:inviter" ...). The unique index at the end makes a second
-- write with the same key fail inside the ledger insert, which lib/descoin.js already turns
-- into a full rollback of the balance change.
--
-- Only the backend (service role) reads and writes these tables: RLS on, no policies, no
-- anon / authenticated grants. Additive and safe to re-run. Until it is applied the old
-- columns keep working: the code detects the missing columns / tables and degrades (the
-- dashboard shows what it can, rewards stay pending, nothing is paid instantly any more).

-- ------------------------------------------------------------------ referral_rewards
ALTER TABLE public.referral_rewards ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'paid';
ALTER TABLE public.referral_rewards ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.referral_rewards ADD COLUMN IF NOT EXISTS legacy boolean NOT NULL DEFAULT true;
ALTER TABLE public.referral_rewards ALTER COLUMN legacy SET DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_rewards_status_check') THEN
    ALTER TABLE public.referral_rewards ADD CONSTRAINT referral_rewards_status_check
      CHECK (status IN ('pending', 'held', 'paid', 'revoked', 'expired', 'denied')) NOT VALID;
    ALTER TABLE public.referral_rewards VALIDATE CONSTRAINT referral_rewards_status_check;
  END IF;
END $$;

ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS open_id uuid,
  ADD COLUMN IF NOT EXISTS signup_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_message_peer text,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS unlock_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS inviter_skip text,
  ADD COLUMN IF NOT EXISTS hold_reason text,
  ADD COLUMN IF NOT EXISTS held_at timestamptz,
  ADD COLUMN IF NOT EXISTS held_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoke_reason text,
  ADD COLUMN IF NOT EXISTS revoked_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS device_hash text,
  ADD COLUMN IF NOT EXISTS ip_hash text,
  ADD COLUMN IF NOT EXISTS subnet_hash text,
  ADD COLUMN IF NOT EXISTS email_domain text,
  ADD COLUMN IF NOT EXISTS rules_version integer,
  ADD COLUMN IF NOT EXISTS nudged_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS referral_rewards_status_idx ON public.referral_rewards (status, unlock_at);
CREATE INDEX IF NOT EXISTS referral_rewards_created_idx ON public.referral_rewards (created_at DESC);
CREATE INDEX IF NOT EXISTS referral_rewards_device_idx ON public.referral_rewards (device_hash) WHERE device_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS referral_rewards_inviter_created_idx ON public.referral_rewards (inviter_id, created_at DESC);

-- ------------------------------------------------------------------ link opens (anonymous)
-- One row per visitor per inviter per day. visitor_hash is a salted hash of the network and
-- the browser, never the raw address; the inviter only ever sees counts per channel.
CREATE TABLE IF NOT EXISTS public.referral_opens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'link',
  visitor_hash text NOT NULL,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  opened_at timestamptz NOT NULL DEFAULT now(),
  signup_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  UNIQUE (inviter_id, visitor_hash, day)
);
CREATE INDEX IF NOT EXISTS referral_opens_inviter_idx ON public.referral_opens (inviter_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS referral_opens_opened_idx ON public.referral_opens (opened_at DESC);

-- ------------------------------------------------------------------ milestones 3 / 10 / 25
CREATE TABLE IF NOT EXISTS public.referral_milestones (
  inviter_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  milestone integer NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  item_id text,
  reached_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (inviter_id, milestone)
);

-- ------------------------------------------------------------------ versioned rules
CREATE TABLE IF NOT EXISTS public.referral_rules (
  version integer PRIMARY KEY,
  rules jsonb NOT NULL,
  note text,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ admin actions (undo 10 min)
CREATE TABLE IF NOT EXISTS public.referral_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  actor_username text,
  action text NOT NULL,
  inviter_id uuid REFERENCES public.users (id) ON DELETE CASCADE,
  referral_ids uuid[] NOT NULL DEFAULT '{}',
  amount integer NOT NULL DEFAULT 0,
  reason_code text,
  note text,
  user_message text,
  notify_inviter boolean NOT NULL DEFAULT false,
  notify_invitees boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  undo_until timestamptz,
  undone_at timestamptz,
  undone_by uuid REFERENCES public.users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS referral_actions_created_idx ON public.referral_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS referral_actions_inviter_idx ON public.referral_actions (inviter_id, created_at DESC);

-- ------------------------------------------------------------------ anomaly alerts
CREATE TABLE IF NOT EXISTS public.referral_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  handled_at timestamptz
);
CREATE INDEX IF NOT EXISTS referral_alerts_open_idx ON public.referral_alerts (status, created_at DESC);

-- ------------------------------------------------------------------ per-inviter state
CREATE TABLE IF NOT EXISTS public.referral_inviter_state (
  inviter_id uuid PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  link_paused boolean NOT NULL DEFAULT false,
  paused_reason text,
  paused_at timestamptz,
  paused_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  device_hashes text[] NOT NULL DEFAULT '{}',
  subnet_hashes text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ notices for the user
-- What an inviter / invitee is told about a hold, a release or a revoke (the text the admin
-- previewed), shown in Davet Merkezi and as a toast on the next connect.
CREATE TABLE IF NOT EXISTS public.referral_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  text text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  action_id uuid REFERENCES public.referral_actions (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  withdrawn_at timestamptz
);
CREATE INDEX IF NOT EXISTS referral_notices_user_idx ON public.referral_notices (user_id, created_at DESC);

-- ------------------------------------------------------------------ DesCoin ledger
-- New ledger reasons: referral_milestone (3 / 10 / 25 friends) and referral_revoke (an admin
-- took a paid invite reward back). Same pattern as 20261115_shop_desk.sql: read the current
-- list from the constraint and append what is missing.
DO $$
DECLARE
  def text;
  reasons text[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conname = 'descoin_ledger_reason_check' AND conrelid = 'public.descoin_ledger'::regclass;
  IF def IS NULL THEN
    RETURN;
  END IF;
  IF position('referral_milestone' IN def) > 0 AND position('referral_revoke' IN def) > 0 THEN
    RETURN;
  END IF;
  SELECT array_agg(DISTINCT m[1]) INTO reasons FROM regexp_matches(def, '''([a-z_]+)''', 'g') AS m;
  IF NOT ('referral_milestone' = ANY (reasons)) THEN reasons := array_append(reasons, 'referral_milestone'); END IF;
  IF NOT ('referral_revoke' = ANY (reasons)) THEN reasons := array_append(reasons, 'referral_revoke'); END IF;
  ALTER TABLE public.descoin_ledger DROP CONSTRAINT descoin_ledger_reason_check;
  EXECUTE format(
    'ALTER TABLE public.descoin_ledger ADD CONSTRAINT descoin_ledger_reason_check CHECK (reason = ANY (%L::text[])) NOT VALID',
    reasons
  );
  ALTER TABLE public.descoin_ledger VALIDATE CONSTRAINT descoin_ledger_reason_check;
END $$;

-- Idempotency keys (lib/descoin.js creditIdempotent / debitIdempotent and every other
-- caller that puts meta.idempotencyKey on a ledger row): one ledger row per key.
CREATE UNIQUE INDEX IF NOT EXISTS descoin_ledger_idempotency_key_uniq
  ON public.descoin_ledger ((meta ->> 'idempotencyKey'))
  WHERE meta ? 'idempotencyKey';

-- ------------------------------------------------------------------ lock down
ALTER TABLE public.referral_opens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_inviter_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_opens, public.referral_milestones, public.referral_rules,
  public.referral_actions, public.referral_alerts, public.referral_inviter_state,
  public.referral_notices FROM anon, authenticated;
REVOKE ALL ON public.referral_rewards FROM anon, authenticated;
