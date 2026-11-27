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
  -- Both stored forms: '{a,b}'::text[] (format(%L) rebuilds) and 'a'::text quoted words (older).
  -- Reading only the quoted words left ANY (NULL::text[]) on the literal form, a CHECK that
  -- blocks nothing. 20261125f rebuilds the full superset afterwards either way.
  IF (regexp_match(def, '''\{([^}]*)\}'''))[1] IS NOT NULL THEN
    reasons := string_to_array(replace((regexp_match(def, '''\{([^}]*)\}'''))[1], '"', ''), ',');
  ELSE
    SELECT array_agg(DISTINCT m[1]) INTO reasons FROM regexp_matches(def, '''([a-z_]+)''', 'g') AS m;
  END IF;
  reasons := coalesce(reasons, ARRAY[]::text[]);
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

-- ------------------------------------------------------------------ exclusive invite cosmetics
-- Owner decision (27 Nov 2026): the milestones and the invitee welcome give cosmetics that can
-- never be bought, so they mean something. Market 2.0 rendering (s2- skus), active = false
-- (never in the storefront, never a shop purchase or shop gift: both require active), tags
-- "exclusive" + "referral". Only lib/referrals grants them (user_inventory, acquired_via
-- 'gift', idempotent). Fixed ids; the art source is frontend/backend/catalog/referral/
-- cosmetics.js (node ... --sql prints this insert). Needs 20261115_shop2.sql (i18n, tags).
--   3 friends  "Bağlantı" profile badge     10 friends "Köprü" avatar frame
--   25 friends "Halka" banner + name glow   invitee    "Davetli" badge
INSERT INTO public.shop_items (id, sku, name, description, category, asset_url, preview_url, price_cents, price_descoin, effect_key, rarity, sort_order, active, i18n, tags)
VALUES
  ('5f7a1c00-0d3a-4e8b-9c11-000000000003'::uuid, 's2-profile_badge-ref-baglanti', 'Bond', 'Invite reward: for bringing 3 active friends to Descall. Not for sale.', 'profile_badge', 'data:image/svg+xml;utf8,%3Csvg xmlns=''http://www.w3.org/2000/svg'' viewBox=''0 0 24 24'' width=''24'' height=''24''%3E%3Cdefs%3E%3CradialGradient id=''b'' cx=''0.32'' cy=''0.25'' r=''0.85''%3E%3Cstop offset=''0'' stop-color=''%23c9d5ff''/%3E%3Cstop offset=''0.55'' stop-color=''%23587af5''/%3E%3Cstop offset=''1'' stop-color=''%231c2a8f''/%3E%3C/radialGradient%3E%3ClinearGradient id=''hl'' x1=''0'' y1=''0'' x2=''0'' y2=''1''%3E%3Cstop offset=''0'' stop-color=''%23fff'' stop-opacity=''0.55''/%3E%3Cstop offset=''0.5'' stop-color=''%23fff'' stop-opacity=''0''/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d=''M12 1.4L20.8 4.6V11.2C20.8 16.6 17 20.6 12 22.6C7 20.6 3.2 16.6 3.2 11.2V4.6Z'' fill=''url(%23b)'' stroke=''%230b0d17'' stroke-width=''1.3'' stroke-linejoin=''round''/%3E%3Cpath d=''M12 1.4L20.8 4.6V11.2C20.8 16.6 17 20.6 12 22.6C7 20.6 3.2 16.6 3.2 11.2V4.6Z'' fill=''none'' stroke=''%23fff'' stroke-opacity=''.42'' stroke-width=''.8'' transform=''translate(12 12) scale(.84) translate(-12 -12)''/%3E%3Cpath d=''M12 1.4L20.8 4.6V11.2C20.8 16.6 17 20.6 12 22.6C7 20.6 3.2 16.6 3.2 11.2V4.6Z'' fill=''url(%23hl)'' transform=''translate(12 9) scale(.78 .6) translate(-12 -12)''/%3E%3Cg opacity=''.5'' transform=''translate(0 .9)''%3E%3Crect x=''-3.8'' y=''-2.2'' width=''7.6'' height=''4.4'' rx=''2.2'' fill=''none'' stroke=''%231b2a80'' stroke-width=''1.7'' transform=''translate(10 14.4) rotate(-40)''/%3E%3Crect x=''-3.8'' y=''-2.2'' width=''7.6'' height=''4.4'' rx=''2.2'' fill=''none'' stroke=''%231b2a80'' stroke-width=''1.7'' transform=''translate(14 10.4) rotate(-40)''/%3E%3C/g%3E%3Crect x=''-3.8'' y=''-2.2'' width=''7.6'' height=''4.4'' rx=''2.2'' fill=''none'' stroke=''%23fff'' stroke-width=''1.7'' transform=''translate(10 14.4) rotate(-40)''/%3E%3Crect x=''-3.8'' y=''-2.2'' width=''7.6'' height=''4.4'' rx=''2.2'' fill=''none'' stroke=''%23fff'' stroke-width=''1.7'' transform=''translate(14 10.4) rotate(-40)''/%3E%3Cpath d=''M0 -2.2Q0.4 -0.4 2.2 0Q0.4 0.4 0 2.2Q-0.4 0.4 -2.2 0Q-0.4 -0.4 0 -2.2Z'' transform=''translate(16.6 7)'' fill=''%23fff''/%3E%3C/svg%3E', NULL, 0, 0, NULL, 'rare', 29000, false, '{"name":{"tr":"Bağlantı","en":"Bond","de":"Verbindung","es":"Vínculo","fr":"Lien","pt-BR":"Vínculo","ru":"Связь"},"description":{"tr":"Davet ödülü: Descall''a 3 aktif arkadaş getirenlere. Satışta değil.","en":"Invite reward: for bringing 3 active friends to Descall. Not for sale.","de":"Einladungsbelohnung: für 3 aktive Freunde auf Descall. Nicht käuflich.","es":"Recompensa por invitación: por traer 3 amigos activos a Descall. No está a la venta.","fr":"Récompense d''invitation : pour 3 amis actifs amenés sur Descall. Pas en vente.","pt-BR":"Recompensa de convite: por trazer 3 amigos ativos ao Descall. Não está à venda.","ru":"Награда за приглашения: за 3 активных друзей в Descall. Не продаётся."}}'::jsonb, ARRAY['shop2', 'exclusive', 'referral', 'milestone:3']::text[]),
  ('5f7a1c00-0d3a-4e8b-9c11-000000000010'::uuid, 's2-avatar_frame-ref-kopru', 'Bridge', 'Invite reward: 10 active friends. A blue bridge ring and ten friend lights that glow one by one. Not for sale.', 'avatar_frame', 'data:image/svg+xml;utf8,%3Csvg xmlns=''http://www.w3.org/2000/svg'' viewBox=''0 0 200 200'' width=''200'' height=''200''%3E%3Cdefs%3E%3ClinearGradient id=''m'' gradientUnits=''userSpaceOnUse'' x1=''20'' y1=''20'' x2=''180'' y2=''180''%3E%3Cstop offset=''0'' stop-color=''%23eaf0ff''/%3E%3Cstop offset=''0.28'' stop-color=''%23a9bbff''/%3E%3Cstop offset=''0.55'' stop-color=''%23587af5''/%3E%3Cstop offset=''0.8'' stop-color=''%232a3fb8''/%3E%3Cstop offset=''1'' stop-color=''%230e1752''/%3E%3C/linearGradient%3E%3ClinearGradient id=''cab'' gradientUnits=''userSpaceOnUse'' x1=''20'' y1=''0'' x2=''180'' y2=''0''%3E%3Cstop offset=''0'' stop-color=''%237cebd8''/%3E%3Cstop offset=''0.5'' stop-color=''%23a9bbff''/%3E%3Cstop offset=''1'' stop-color=''%238c5cf6''/%3E%3C/linearGradient%3E%3CradialGradient id=''glow'' gradientUnits=''userSpaceOnUse'' cx=''100'' cy=''100'' r=''100''%3E%3Cstop offset=''0.72'' stop-color=''%23587af5'' stop-opacity=''0''/%3E%3Cstop offset=''0.84'' stop-color=''%23587af5'' stop-opacity=''0.45''/%3E%3Cstop offset=''1'' stop-color=''%238c5cf6'' stop-opacity=''0''/%3E%3C/radialGradient%3E%3CradialGradient id=''node'' cx=''0.35'' cy=''0.3'' r=''0.7''%3E%3Cstop offset=''0'' stop-color=''%23ffffff''/%3E%3Cstop offset=''0.45'' stop-color=''%23c9d5ff''/%3E%3Cstop offset=''1'' stop-color=''%233a52d6''/%3E%3C/radialGradient%3E%3Cg id=''n''%3E%3Ccircle r=''4.4'' fill=''url(%23node)'' stroke=''%230e1752'' stroke-width=''.9''/%3E%3Ccircle cx=''-1.3'' cy=''-1.4'' r=''1.1'' fill=''%23fff'' fill-opacity=''.9''/%3E%3C/g%3E%3C/defs%3E%3Ccircle cx=''100'' cy=''100'' r=''97'' fill=''url(%23glow)''%3E%3Canimate attributeName=''opacity'' values=''1;.55;1'' dur=''4s'' repeatCount=''3''/%3E%3C/circle%3E%3Cpath d=''M18.6 53A94 94 0 0 1 181.4 53'' fill=''none'' stroke=''url(%23cab)'' stroke-width=''2.4'' stroke-linecap=''round''/%3E%3Cpath d=''M181.4 147A94 94 0 0 1 18.6 147'' fill=''none'' stroke=''url(%23cab)'' stroke-width=''2.4'' stroke-linecap=''round''/%3E%3Cg transform=''translate(33.5 40.1) rotate(-48)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(47.4 27.6) rotate(-36)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(63.6 18.2) rotate(-24)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(81.4 12.5) rotate(-12)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(100 10.5) rotate(0)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(118.6 12.5) rotate(12)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(136.4 18.2) rotate(24)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(152.6 27.6) rotate(36)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(166.5 40.1) rotate(48)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(166.5 159.9) rotate(132)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(152.6 172.4) rotate(144)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(136.4 181.8) rotate(156)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(118.6 187.5) rotate(168)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(100 189.5) rotate(180)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(81.4 187.5) rotate(192)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(63.6 181.8) rotate(204)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(47.4 172.4) rotate(216)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Cg transform=''translate(33.5 159.9) rotate(228)''%3E%3Cpath d=''M0 -4.4V2'' stroke=''%23a9bbff'' stroke-width=''1.1'' stroke-opacity=''.75''/%3E%3C/g%3E%3Ccircle cx=''100'' cy=''100'' r=''80'' fill=''none'' stroke=''url(%23m)'' stroke-width=''8''/%3E%3Ccircle cx=''100'' cy=''100'' r=''76.5'' fill=''none'' stroke=''%23000'' stroke-width=''1.4'' stroke-opacity=''0.45''/%3E%3Ccircle cx=''100'' cy=''100'' r=''83.6'' fill=''none'' stroke=''%23dfe6ff'' stroke-width=''0.9'' stroke-opacity=''0.35''/%3E%3Cpath d=''M24.5 69.5A81.44 81.44 0 0 1 88.7 19.4'' fill=''none'' stroke=''%23fff'' stroke-width=''2.2'' stroke-linecap=''round'' stroke-opacity=''0.55''/%3E%3Ccircle cx=''100'' cy=''100'' r=''80'' fill=''none'' stroke=''%23eaf0ff'' stroke-width=''1'' stroke-dasharray=''1.5 7'' stroke-opacity=''.55''/%3E%3Cg transform=''translate(176.2 56) rotate(60)''%3E%3Crect x=''-3.2'' y=''-8'' width=''6.4'' height=''16'' rx=''1.6'' fill=''url(%23m)'' stroke=''%230e1752'' stroke-width=''.9''/%3E%3C/g%3E%3Cg transform=''translate(176.2 144) rotate(120)''%3E%3Crect x=''-3.2'' y=''-8'' width=''6.4'' height=''16'' rx=''1.6'' fill=''url(%23m)'' stroke=''%230e1752'' stroke-width=''.9''/%3E%3C/g%3E%3Cg transform=''translate(23.8 144) rotate(240)''%3E%3Crect x=''-3.2'' y=''-8'' width=''6.4'' height=''16'' rx=''1.6'' fill=''url(%23m)'' stroke=''%230e1752'' stroke-width=''.9''/%3E%3C/g%3E%3Cg transform=''translate(23.8 56) rotate(300)''%3E%3Crect x=''-3.2'' y=''-8'' width=''6.4'' height=''16'' rx=''1.6'' fill=''url(%23m)'' stroke=''%230e1752'' stroke-width=''.9''/%3E%3C/g%3E%3Cg%3E%3Cg transform=''translate(124.7 23.9) rotate(18)''%3E%3Cuse href=''%23n''/%3E%3Ccircle r=''5.6'' fill=''none'' stroke=''%23a9bbff'' stroke-width=''1'' opacity=''0''%3E%3Canimate attributeName=''opacity'' values=''0;.9;0'' dur=''2.4s'' repeatCount=''2''/%3E%3C/circle%3E%3C/g%3E%3Cg transform=''translate(164.7 53) rotate(54)''%3E%3Cuse href=''%23n''/%3E%3Ccircle r=''5.6'' fill=''none'' stroke=''%23a9bbff'' stroke-width=''1'' opacity=''0''%3E%3Canimate attributeName=''opacity'' values=''0;.9;0'' dur=''2.4s'' repeatCount=''2'' begin=''0.2s''/%3E%3C/circle%3E%3C/g%3E%3Cg transform=''translate(180 100) rotate(90)''%3E%3Cuse href=''%23n''/%3E%3Ccircle r=''5.6'' fill=''none'' stroke=''%23a9bbff'' stroke-width=''1'' opacity=''0''%3E%3Canimate attributeName=''opacity'' values=''0;.9;0'' dur=''2.4s'' repeatCount=''2'' begin=''0.5s''/%3E%3C/circle%3E%3C/g%3E%3Cg transform=''translate(164.7 147) rotate(126)''%3E%3Cuse href=''%23n''/%3E%3Ccircle r=''5.6'' fill=''none'' stroke=''%23a9bbff'' stroke-width=''1'' opacity=''0''%3E%3Canimate attributeName=''opacity'' values=''0;.9;0'' dur=''2.4s'' repeatCount=''2'' begin=''0.7s''/%3E%3C/circle%3E%3C/g%3E%3Cg transform=''translate(124.7 176.1) rotate(162)''%3E%3Cuse href=''%23n''/%3E%3Ccircle r=''5.6'' fill=''none'' stroke=''%23a9bbff'' stroke-width=''1'' opacity=''0''%3E%3Canimate attributeName=''opacity'' values=''0;.9;0'' dur=''2.4s'' repeatCount=''2'' begin=''1s''/%3E%3C/circle%3E%3C/g%3E%3Cg transform=''translate(75.3 176.1) rotate(198)''%3E%3Cuse href=''%23n''/%3E%3Ccircle r=''5.6'' fill=''none'' stroke=''%23a9bbff'' stroke-width=''1'' opacity=''0''%3E%3Canimate attributeName=''opacity'' values=''0;.9;0'' dur=''2.4s'' repeatCount=''2'' begin=''1.2s''/%3E%3C/circle%3E%3C/g%3E%3Cg transform=''translate(35.3 147) rotate(234)''%3E%3Cuse href=''%23n''/%3E%3Ccircle r=''5.6'' fill=''none'' stroke=''%23a9bbff'' stroke-width=''1'' opacity=''0''%3E%3Canimate attributeName=''opacity'' values=''0;.9;0'' dur=''2.4s'' repeatCount=''2'' begin=''1.4s''/%3E%3C/circle%3E%3C/g%3E%3Cg transform=''translate(20 100) rotate(270)''%3E%3Cuse href=''%23n''/%3E%3Ccircle r=''5.6'' fill=''none'' stroke=''%23a9bbff'' stroke-width=''1'' opacity=''0''%3E%3Canimate attributeName=''opacity'' values=''0;.9;0'' dur=''2.4s'' repeatCount=''2'' begin=''1.7s''/%3E%3C/circle%3E%3C/g%3E%3Cg transform=''translate(35.3 53) rotate(306)''%3E%3Cuse href=''%23n''/%3E%3Ccircle r=''5.6'' fill=''none'' stroke=''%23a9bbff'' stroke-width=''1'' opacity=''0''%3E%3Canimate attributeName=''opacity'' values=''0;.9;0'' dur=''2.4s'' repeatCount=''2'' begin=''1.9s''/%3E%3C/circle%3E%3C/g%3E%3Cg transform=''translate(75.3 23.9) rotate(342)''%3E%3Cuse href=''%23n''/%3E%3Ccircle r=''5.6'' fill=''none'' stroke=''%23a9bbff'' stroke-width=''1'' opacity=''0''%3E%3Canimate attributeName=''opacity'' values=''0;.9;0'' dur=''2.4s'' repeatCount=''2'' begin=''2.2s''/%3E%3C/circle%3E%3C/g%3E%3CanimateTransform attributeName=''transform'' type=''rotate'' from=''0 100 100'' to=''360 100 100'' dur=''60s'' repeatCount=''1''/%3E%3C/g%3E%3Cpath d=''M0 -6Q1 -1 6 0Q1 1 0 6Q-1 1 -6 0Q-1 -1 0 -6Z'' transform=''translate(100 8)'' fill=''%23fff'' opacity=''0''%3E%3Canimate attributeName=''opacity'' values=''0;1;0'' dur=''1.8s'' repeatCount=''3''/%3E%3C/path%3E%3Cpath d=''M0 -6Q1 -1 6 0Q1 1 0 6Q-1 1 -6 0Q-1 -1 0 -6Z'' transform=''translate(100 192)'' fill=''%23fff'' opacity=''0''%3E%3Canimate attributeName=''opacity'' values=''0;1;0'' dur=''1.8s'' repeatCount=''3'' begin=''0.9s''/%3E%3C/path%3E%3C/svg%3E', NULL, 0, 0, NULL, 'epic', 29001, false, '{"name":{"tr":"Köprü","en":"Bridge","de":"Brücke","es":"Puente","fr":"Pont","pt-BR":"Ponte","ru":"Мост"},"description":{"tr":"Davet ödülü: 10 aktif arkadaş. Mavi bir köprü halkası ve sırayla yanan on arkadaş ışığı. Satışta değil.","en":"Invite reward: 10 active friends. A blue bridge ring and ten friend lights that glow one by one. Not for sale.","de":"Einladungsbelohnung: 10 aktive Freunde. Ein blauer Brückenring und zehn Freundeslichter, die nacheinander leuchten. Nicht käuflich.","es":"Recompensa por invitación: 10 amigos activos. Un aro de puente azul y diez luces de amigos que se encienden una a una. No está a la venta.","fr":"Récompense d''invitation : 10 amis actifs. Un anneau de pont bleu et dix lumières d''amis qui s''allument une à une. Pas en vente.","pt-BR":"Recompensa de convite: 10 amigos ativos. Um aro de ponte azul e dez luzes de amigos que acendem uma a uma. Não está à venda.","ru":"Награда за приглашения: 10 активных друзей. Синее кольцо-мост и десять огоньков друзей, загорающихся по очереди. Не продаётся."}}'::jsonb, ARRAY['shop2', 'exclusive', 'referral', 'milestone:10']::text[]),
  ('5f7a1c00-0d3a-4e8b-9c11-000000000025'::uuid, 's2-banner-ref-halka', 'Circle', 'Invite reward: 25 active friends. Interlocking rings glowing in a night sky. Not for sale.', 'banner', 'data:image/svg+xml;utf8,%3Csvg xmlns=''http://www.w3.org/2000/svg'' viewBox=''0 0 600 200'' width=''600'' height=''200'' preserveAspectRatio=''xMidYMid slice''%3E%3Cdefs%3E%3ClinearGradient id=''sky'' x1=''0'' y1=''0'' x2=''0'' y2=''1''%3E%3Cstop offset=''0'' stop-color=''%230b0f2a''/%3E%3Cstop offset=''.55'' stop-color=''%23121a4a''/%3E%3Cstop offset=''1'' stop-color=''%230a0b1c''/%3E%3C/linearGradient%3E%3CradialGradient id=''aur1'' gradientUnits=''userSpaceOnUse'' cx=''170'' cy=''40'' r=''260''%3E%3Cstop offset=''0'' stop-color=''%23587af5'' stop-opacity=''.55''/%3E%3Cstop offset=''1'' stop-color=''%23587af5'' stop-opacity=''0''/%3E%3C/radialGradient%3E%3CradialGradient id=''aur2'' gradientUnits=''userSpaceOnUse'' cx=''470'' cy=''170'' r=''260''%3E%3Cstop offset=''0'' stop-color=''%238c5cf6'' stop-opacity=''.45''/%3E%3Cstop offset=''1'' stop-color=''%238c5cf6'' stop-opacity=''0''/%3E%3C/radialGradient%3E%3CradialGradient id=''aur3'' gradientUnits=''userSpaceOnUse'' cx=''330'' cy=''210'' r=''200''%3E%3Cstop offset=''0'' stop-color=''%232ad4b8'' stop-opacity=''.35''/%3E%3Cstop offset=''1'' stop-color=''%232ad4b8'' stop-opacity=''0''/%3E%3C/radialGradient%3E%3ClinearGradient id=''r1'' gradientUnits=''userSpaceOnUse'' x1=''120'' y1=''0'' x2=''480'' y2=''0''%3E%3Cstop offset=''0'' stop-color=''%23a9bbff''/%3E%3Cstop offset=''.5'' stop-color=''%23587af5''/%3E%3Cstop offset=''1'' stop-color=''%232ad4b8''/%3E%3C/linearGradient%3E%3ClinearGradient id=''r2'' gradientUnits=''userSpaceOnUse'' x1=''120'' y1=''0'' x2=''480'' y2=''0''%3E%3Cstop offset=''0'' stop-color=''%237cebd8''/%3E%3Cstop offset=''.5'' stop-color=''%23a9bbff''/%3E%3Cstop offset=''1'' stop-color=''%238c5cf6''/%3E%3C/linearGradient%3E%3CradialGradient id=''core'' gradientUnits=''userSpaceOnUse'' cx=''300'' cy=''100'' r=''34''%3E%3Cstop offset=''0'' stop-color=''%23ffffff'' stop-opacity=''.9''/%3E%3Cstop offset=''.35'' stop-color=''%23a9bbff'' stop-opacity=''.55''/%3E%3Cstop offset=''1'' stop-color=''%23587af5'' stop-opacity=''0''/%3E%3C/radialGradient%3E%3Cfilter id=''gl'' x=''-20%25'' y=''-40%25'' width=''140%25'' height=''180%25''%3E%3CfeGaussianBlur stdDeviation=''5''/%3E%3C/filter%3E%3CradialGradient id=''vg'' cx=''.5'' cy=''.45'' r=''.75''%3E%3Cstop offset=''.55'' stop-color=''%23000'' stop-opacity=''0''/%3E%3Cstop offset=''1'' stop-color=''%23000'' stop-opacity=''.45''/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width=''600'' height=''200'' fill=''url(%23sky)''/%3E%3Crect width=''600'' height=''200'' fill=''url(%23aur1)''/%3E%3Crect width=''600'' height=''200'' fill=''url(%23aur2)''/%3E%3Crect width=''600'' height=''200'' fill=''url(%23aur3)''/%3E%3Ccircle cx=''317'' cy=''108'' r=''1.1'' fill=''%23fff'' fill-opacity=''.56''/%3E%3Ccircle cx=''243'' cy=''64'' r=''1.3'' fill=''%23fff'' fill-opacity=''.36''/%3E%3Ccircle cx=''342'' cy=''77'' r=''.7'' fill=''%23fff'' fill-opacity=''.52''/%3E%3Ccircle cx=''513'' cy=''0'' r=''.5'' fill=''%23fff'' fill-opacity=''.82''/%3E%3Ccircle cx=''416'' cy=''73'' r=''1.5'' fill=''%23fff'' fill-opacity=''.27''/%3E%3Ccircle cx=''462'' cy=''25'' r=''1.3'' fill=''%23fff'' fill-opacity=''.30''/%3E%3Ccircle cx=''41'' cy=''169'' r=''.8'' fill=''%23fff'' fill-opacity=''.78''/%3E%3Ccircle cx=''15'' cy=''187'' r=''1.5'' fill=''%23fff'' fill-opacity=''.80''/%3E%3Ccircle cx=''323'' cy=''48'' r=''1.2'' fill=''%23fff'' fill-opacity=''.26''/%3E%3Ccircle cx=''134'' cy=''196'' r=''.4'' fill=''%23fff'' fill-opacity=''.34''/%3E%3Ccircle cx=''546'' cy=''165'' r=''.4'' fill=''%23fff'' fill-opacity=''.80''/%3E%3Ccircle cx=''126'' cy=''171'' r=''.5'' fill=''%23fff'' fill-opacity=''.42''/%3E%3Ccircle cx=''254'' cy=''176'' r=''1.0'' fill=''%23fff'' fill-opacity=''.60''/%3E%3Ccircle cx=''488'' cy=''90'' r=''1.3'' fill=''%23fff'' fill-opacity=''.48''/%3E%3Ccircle cx=''140'' cy=''0'' r=''.6'' fill=''%23fff'' fill-opacity=''.69''/%3E%3Ccircle cx=''335'' cy=''175'' r=''1.5'' fill=''%23fff'' fill-opacity=''.61''/%3E%3Ccircle cx=''493'' cy=''24'' r=''1.1'' fill=''%23fff'' fill-opacity=''.62''/%3E%3Ccircle cx=''256'' cy=''188'' r=''1.2'' fill=''%23fff'' fill-opacity=''.76''/%3E%3Ccircle cx=''327'' cy=''146'' r=''.5'' fill=''%23fff'' fill-opacity=''.26''/%3E%3Ccircle cx=''581'' cy=''87'' r=''.9'' fill=''%23fff'' fill-opacity=''.82''/%3E%3Ccircle cx=''497'' cy=''51'' r=''.5'' fill=''%23fff'' fill-opacity=''.63''/%3E%3Ccircle cx=''570'' cy=''169'' r=''.6'' fill=''%23fff'' fill-opacity=''.63''/%3E%3Ccircle cx=''533'' cy=''70'' r=''.8'' fill=''%23fff'' fill-opacity=''.83''/%3E%3Ccircle cx=''180'' cy=''18'' r=''1.5'' fill=''%23fff'' fill-opacity=''.34''/%3E%3Ccircle cx=''593'' cy=''46'' r=''.7'' fill=''%23fff'' fill-opacity=''.73''/%3E%3Ccircle cx=''241'' cy=''63'' r=''.9'' fill=''%23fff'' fill-opacity=''.36''/%3E%3Ccircle cx=''419'' cy=''86'' r=''1.0'' fill=''%23fff'' fill-opacity=''.33''/%3E%3Ccircle cx=''438'' cy=''67'' r=''1.3'' fill=''%23fff'' fill-opacity=''.60''/%3E%3Ccircle cx=''20'' cy=''164'' r=''1.4'' fill=''%23fff'' fill-opacity=''.42''/%3E%3Ccircle cx=''310'' cy=''108'' r=''1.0'' fill=''%23fff'' fill-opacity=''.43''/%3E%3Ccircle cx=''495'' cy=''3'' r=''.7'' fill=''%23fff'' fill-opacity=''.55''/%3E%3Ccircle cx=''81'' cy=''134'' r=''1.1'' fill=''%23fff'' fill-opacity=''.78''/%3E%3Ccircle cx=''332'' cy=''29'' r=''1.4'' fill=''%23fff'' fill-opacity=''.73''/%3E%3Ccircle cx=''106'' cy=''162'' r=''.5'' fill=''%23fff'' fill-opacity=''.84''/%3E%3Ccircle cx=''304'' cy=''104'' r=''1.3'' fill=''%23fff'' fill-opacity=''.74''/%3E%3Ccircle cx=''170'' cy=''189'' r=''1.4'' fill=''%23fff'' fill-opacity=''.74''/%3E%3Ccircle cx=''301'' cy=''123'' r=''1.1'' fill=''%23fff'' fill-opacity=''.48''/%3E%3Ccircle cx=''273'' cy=''21'' r=''1.0'' fill=''%23fff'' fill-opacity=''.77''/%3E%3Ccircle cx=''196'' cy=''114'' r=''.8'' fill=''%23fff'' fill-opacity=''.77''/%3E%3Ccircle cx=''473'' cy=''91'' r=''1.3'' fill=''%23fff'' fill-opacity=''.46''/%3E%3Ccircle cx=''161'' cy=''93'' r=''.5'' fill=''%23fff'' fill-opacity=''.33''/%3E%3Ccircle cx=''171'' cy=''36'' r=''.4'' fill=''%23fff'' fill-opacity=''.29''/%3E%3Ccircle cx=''377'' cy=''88'' r=''1.0'' fill=''%23fff'' fill-opacity=''.35''/%3E%3Ccircle cx=''28'' cy=''94'' r=''1.5'' fill=''%23fff'' fill-opacity=''.76''/%3E%3Ccircle cx=''444'' cy=''68'' r=''1.2'' fill=''%23fff'' fill-opacity=''.64''/%3E%3Ccircle cx=''105'' cy=''136'' r=''.5'' fill=''%23fff'' fill-opacity=''.67''/%3E%3Ccircle cx=''326'' cy=''58'' r=''1.2'' fill=''%23fff'' fill-opacity=''.55''/%3E%3Ccircle cx=''185'' cy=''37'' r=''.8'' fill=''%23fff'' fill-opacity=''.47''/%3E%3Ccircle cx=''583'' cy=''158'' r=''1.2'' fill=''%23fff'' fill-opacity=''.76''/%3E%3Ccircle cx=''214'' cy=''154'' r=''.4'' fill=''%23fff'' fill-opacity=''.64''/%3E%3Ccircle cx=''479'' cy=''125'' r=''.7'' fill=''%23fff'' fill-opacity=''.81''/%3E%3Ccircle cx=''114'' cy=''103'' r=''.6'' fill=''%23fff'' fill-opacity=''.49''/%3E%3Ccircle cx=''1'' cy=''114'' r=''.9'' fill=''%23fff'' fill-opacity=''.40''/%3E%3Ccircle cx=''219'' cy=''65'' r=''1.4'' fill=''%23fff'' fill-opacity=''.85''/%3E%3Ccircle cx=''273'' cy=''48'' r=''1.2'' fill=''%23fff'' fill-opacity=''.26''/%3E%3Ccircle cx=''31'' cy=''176'' r=''1.0'' fill=''%23fff'' fill-opacity=''.63''/%3E%3Ccircle cx=''504'' cy=''106'' r=''.8'' fill=''%23fff'' fill-opacity=''.42''/%3E%3Ccircle cx=''280'' cy=''72'' r=''1.3'' fill=''%23fff'' fill-opacity=''.78''/%3E%3Ccircle cx=''181'' cy=''176'' r=''.9'' fill=''%23fff'' fill-opacity=''.46''/%3E%3Ccircle cx=''239'' cy=''64'' r=''.6'' fill=''%23fff'' fill-opacity=''.58''/%3E%3Ccircle cx=''346'' cy=''47'' r=''.6'' fill=''%23fff'' fill-opacity=''.81''/%3E%3Ccircle cx=''230'' cy=''76'' r=''.5'' fill=''%23fff'' fill-opacity=''.67''/%3E%3Ccircle cx=''433'' cy=''83'' r=''.6'' fill=''%23fff'' fill-opacity=''.69''/%3E%3Ccircle cx=''474'' cy=''125'' r=''1.0'' fill=''%23fff'' fill-opacity=''.39''/%3E%3Ccircle cx=''144'' cy=''171'' r=''.9'' fill=''%23fff'' fill-opacity=''.85''/%3E%3Ccircle cx=''307'' cy=''69'' r=''1.1'' fill=''%23fff'' fill-opacity=''.75''/%3E%3Ccircle cx=''169'' cy=''112'' r=''.8'' fill=''%23fff'' fill-opacity=''.46''/%3E%3Ccircle cx=''334'' cy=''9'' r=''1.0'' fill=''%23fff'' fill-opacity=''.55''/%3E%3Ccircle cx=''165'' cy=''121'' r=''.6'' fill=''%23fff'' fill-opacity=''.53''/%3E%3Ccircle cx=''329'' cy=''192'' r=''.7'' fill=''%23fff'' fill-opacity=''.36''/%3E%3Cg filter=''url(%23gl)'' opacity=''.9''%3E%3Cellipse cx=''300'' cy=''100'' rx=''70'' ry=''70'' fill=''none'' stroke=''url(%23r1)'' stroke-width=''12'' transform=''rotate(0 300 100)''/%3E%3Cellipse cx=''300'' cy=''100'' rx=''150'' ry=''44'' fill=''none'' stroke=''url(%23r2)'' stroke-width=''6'' transform=''rotate(-8 300 100)''/%3E%3Cellipse cx=''300'' cy=''100'' rx=''150'' ry=''44'' fill=''none'' stroke=''url(%23r1)'' stroke-width=''6'' transform=''rotate(8 300 100)''/%3E%3C/g%3E%3Cellipse cx=''300'' cy=''100'' rx=''150'' ry=''44'' fill=''none'' stroke=''url(%23r2)'' stroke-width=''2.2'' transform=''rotate(-8 300 100)''/%3E%3Cellipse cx=''300'' cy=''100'' rx=''150'' ry=''44'' fill=''none'' stroke=''url(%23r1)'' stroke-width=''2.2'' transform=''rotate(8 300 100)''/%3E%3Cellipse cx=''300'' cy=''100'' rx=''70'' ry=''70'' fill=''none'' stroke=''url(%23r1)'' stroke-width=''4.4'' transform=''rotate(0 300 100)''/%3E%3Ccircle cx=''300'' cy=''100'' r=''34'' fill=''url(%23core)''/%3E%3Ccircle cx=''300'' cy=''30'' r=''4.6'' fill=''%23fff''/%3E%3Ccircle cx=''300'' cy=''30'' r=''2.6'' fill=''%237cebd8''/%3E%3Ccircle cx=''317'' cy=''32'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''317'' cy=''32'' r=''1.7'' fill=''%23a9bbff''/%3E%3Ccircle cx=''334'' cy=''39'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''334'' cy=''39'' r=''1.7'' fill=''%23c3a8ff''/%3E%3Ccircle cx=''348'' cy=''49'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''348'' cy=''49'' r=''1.7'' fill=''%237cebd8''/%3E%3Ccircle cx=''359'' cy=''63'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''359'' cy=''63'' r=''1.7'' fill=''%23a9bbff''/%3E%3Ccircle cx=''367'' cy=''78'' r=''4.6'' fill=''%23fff''/%3E%3Ccircle cx=''367'' cy=''78'' r=''2.6'' fill=''%23c3a8ff''/%3E%3Ccircle cx=''370'' cy=''96'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''370'' cy=''96'' r=''1.7'' fill=''%237cebd8''/%3E%3Ccircle cx=''369'' cy=''113'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''369'' cy=''113'' r=''1.7'' fill=''%23a9bbff''/%3E%3Ccircle cx=''363'' cy=''130'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''363'' cy=''130'' r=''1.7'' fill=''%23c3a8ff''/%3E%3Ccircle cx=''354'' cy=''145'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''354'' cy=''145'' r=''1.7'' fill=''%237cebd8''/%3E%3Ccircle cx=''341'' cy=''157'' r=''4.6'' fill=''%23fff''/%3E%3Ccircle cx=''341'' cy=''157'' r=''2.6'' fill=''%23a9bbff''/%3E%3Ccircle cx=''326'' cy=''165'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''326'' cy=''165'' r=''1.7'' fill=''%23c3a8ff''/%3E%3Ccircle cx=''309'' cy=''169'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''309'' cy=''169'' r=''1.7'' fill=''%237cebd8''/%3E%3Ccircle cx=''291'' cy=''169'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''291'' cy=''169'' r=''1.7'' fill=''%23a9bbff''/%3E%3Ccircle cx=''274'' cy=''165'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''274'' cy=''165'' r=''1.7'' fill=''%23c3a8ff''/%3E%3Ccircle cx=''259'' cy=''157'' r=''4.6'' fill=''%23fff''/%3E%3Ccircle cx=''259'' cy=''157'' r=''2.6'' fill=''%237cebd8''/%3E%3Ccircle cx=''246'' cy=''145'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''246'' cy=''145'' r=''1.7'' fill=''%23a9bbff''/%3E%3Ccircle cx=''237'' cy=''130'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''237'' cy=''130'' r=''1.7'' fill=''%23c3a8ff''/%3E%3Ccircle cx=''231'' cy=''113'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''231'' cy=''113'' r=''1.7'' fill=''%237cebd8''/%3E%3Ccircle cx=''230'' cy=''96'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''230'' cy=''96'' r=''1.7'' fill=''%23a9bbff''/%3E%3Ccircle cx=''233'' cy=''78'' r=''4.6'' fill=''%23fff''/%3E%3Ccircle cx=''233'' cy=''78'' r=''2.6'' fill=''%23c3a8ff''/%3E%3Ccircle cx=''241'' cy=''63'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''241'' cy=''63'' r=''1.7'' fill=''%237cebd8''/%3E%3Ccircle cx=''252'' cy=''49'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''252'' cy=''49'' r=''1.7'' fill=''%23a9bbff''/%3E%3Ccircle cx=''266'' cy=''39'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''266'' cy=''39'' r=''1.7'' fill=''%23c3a8ff''/%3E%3Ccircle cx=''283'' cy=''32'' r=''3.2'' fill=''%23fff''/%3E%3Ccircle cx=''283'' cy=''32'' r=''1.7'' fill=''%237cebd8''/%3E%3Cpath d=''M0 -8Q1 -1 8 0Q1 1 0 8Q-1 1 -8 0Q-1 -1 0 -8Z'' transform=''translate(150 88)'' fill=''%23fff'' fill-opacity=''.9''/%3E%3Cpath d=''M0 -8Q1 -1 8 0Q1 1 0 8Q-1 1 -8 0Q-1 -1 0 -8Z'' transform=''translate(450 112)'' fill=''%23fff'' fill-opacity=''.9''/%3E%3Cpath d=''M0 -8Q1 -1 8 0Q1 1 0 8Q-1 1 -8 0Q-1 -1 0 -8Z'' transform=''translate(300 8)'' fill=''%23fff'' fill-opacity=''.9''/%3E%3Crect width=''600'' height=''200'' fill=''url(%23vg)''/%3E%3C/svg%3E', NULL, 0, 0, NULL, 'legendary', 29002, false, '{"name":{"tr":"Halka","en":"Circle","de":"Kreis","es":"Círculo","fr":"Cercle","pt-BR":"Círculo","ru":"Круг"},"description":{"tr":"Davet ödülü: 25 aktif arkadaş. Gece göğünde iç içe parlayan halkalar. Satışta değil.","en":"Invite reward: 25 active friends. Interlocking rings glowing in a night sky. Not for sale.","de":"Einladungsbelohnung: 25 aktive Freunde. Ineinandergreifende Ringe, die am Nachthimmel leuchten. Nicht käuflich.","es":"Recompensa por invitación: 25 amigos activos. Anillos entrelazados que brillan en un cielo nocturno. No está a la venta.","fr":"Récompense d''invitation : 25 amis actifs. Des anneaux entrelacés qui brillent dans un ciel de nuit. Pas en vente.","pt-BR":"Recompensa de convite: 25 amigos ativos. Anéis entrelaçados brilhando num céu noturno. Não está à venda.","ru":"Награда за приглашения: 25 активных друзей. Переплетённые кольца, сияющие в ночном небе. Не продаётся."}}'::jsonb, ARRAY['shop2', 'exclusive', 'referral', 'milestone:25']::text[]),
  ('5f7a1c00-0d3a-4e8b-9c11-000000000026'::uuid, 's2-name_effect-ref-halka', 'Circle Glow', 'Invite reward: 25 active friends. A glow flowing through blue, teal and violet on your name. Not for sale.', 'name_effect', 'data:,', NULL, 0, 0, 's2-ref-halka', 'legendary', 29003, false, '{"name":{"tr":"Halka Parıltısı","en":"Circle Glow","de":"Kreisglanz","es":"Brillo de círculo","fr":"Éclat du cercle","pt-BR":"Brilho do círculo","ru":"Сияние круга"},"description":{"tr":"Davet ödülü: 25 aktif arkadaş. Adında mavi, turkuaz ve mor arasında akan bir parıltı. Satışta değil.","en":"Invite reward: 25 active friends. A glow flowing through blue, teal and violet on your name. Not for sale.","de":"Einladungsbelohnung: 25 aktive Freunde. Ein Glanz, der in Blau, Türkis und Violett über deinen Namen fließt. Nicht käuflich.","es":"Recompensa por invitación: 25 amigos activos. Un brillo que fluye entre azul, turquesa y violeta en tu nombre. No está a la venta.","fr":"Récompense d''invitation : 25 amis actifs. Un éclat qui coule entre bleu, turquoise et violet sur ton nom. Pas en vente.","pt-BR":"Recompensa de convite: 25 amigos ativos. Um brilho que corre entre azul, turquesa e violeta no seu nome. Não está à venda.","ru":"Награда за приглашения: 25 активных друзей. Сияние, переливающееся синим, бирюзовым и фиолетовым на твоём имени. Не продаётся."}}'::jsonb, ARRAY['shop2', 'exclusive', 'referral', 'milestone:25']::text[]),
  ('5f7a1c00-0d3a-4e8b-9c11-000000000001'::uuid, 's2-profile_badge-ref-davetli', 'Invited', 'You came with a friend''s invite and became really active. Not for sale.', 'profile_badge', 'data:image/svg+xml;utf8,%3Csvg xmlns=''http://www.w3.org/2000/svg'' viewBox=''0 0 24 24'' width=''24'' height=''24''%3E%3Cdefs%3E%3CradialGradient id=''b'' cx=''0.32'' cy=''0.25'' r=''0.85''%3E%3Cstop offset=''0'' stop-color=''%23b9fff1''/%3E%3Cstop offset=''0.55'' stop-color=''%232ad4b8''/%3E%3Cstop offset=''1'' stop-color=''%230d5a8a''/%3E%3C/radialGradient%3E%3ClinearGradient id=''hl'' x1=''0'' y1=''0'' x2=''0'' y2=''1''%3E%3Cstop offset=''0'' stop-color=''%23fff'' stop-opacity=''0.55''/%3E%3Cstop offset=''0.5'' stop-color=''%23fff'' stop-opacity=''0''/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d=''M12 1.2L21.4 6.6V17.4L12 22.8L2.6 17.4V6.6Z'' fill=''url(%23b)'' stroke=''%230b0d17'' stroke-width=''1.3'' stroke-linejoin=''round''/%3E%3Cpath d=''M12 1.2L21.4 6.6V17.4L12 22.8L2.6 17.4V6.6Z'' fill=''none'' stroke=''%23fff'' stroke-opacity=''.42'' stroke-width=''.8'' transform=''translate(12 12) scale(.84) translate(-12 -12)''/%3E%3Cpath d=''M12 1.2L21.4 6.6V17.4L12 22.8L2.6 17.4V6.6Z'' fill=''url(%23hl)'' transform=''translate(12 9) scale(.78 .6) translate(-12 -12)''/%3E%3Cpath d=''M7 14.5c2-3.6 8-3.6 10 0'' stroke=''%230d4d6a'' stroke-opacity=''.5'' stroke-width=''1.9'' fill=''none'' stroke-linecap=''round'' transform=''translate(0 .9)''/%3E%3Cpath d=''M7 14.5c2-3.6 8-3.6 10 0'' stroke=''%23fff'' stroke-width=''1.8'' fill=''none'' stroke-linecap=''round''/%3E%3Ccircle cx=''7'' cy=''14.5'' r=''1.6'' fill=''%23fff''/%3E%3Ccircle cx=''17'' cy=''14.5'' r=''1.6'' fill=''%23fff''/%3E%3Ccircle cx=''12'' cy=''8.4'' r=''2'' fill=''%23fff''/%3E%3C/svg%3E', NULL, 0, 0, NULL, 'common', 29004, false, '{"name":{"tr":"Davetli","en":"Invited","de":"Eingeladen","es":"Invitado","fr":"Invité","pt-BR":"Convidado","ru":"Приглашённый"},"description":{"tr":"Bir arkadaşın davetiyle geldin ve gerçekten aktif oldun. Satışta değil.","en":"You came with a friend''s invite and became really active. Not for sale.","de":"Du bist mit der Einladung eines Freundes gekommen und wirklich aktiv geworden. Nicht käuflich.","es":"Llegaste con la invitación de un amigo y te volviste realmente activo. No está a la venta.","fr":"Tu es venu avec l''invitation d''un ami et tu es devenu vraiment actif. Pas en vente.","pt-BR":"Você chegou com o convite de um amigo e ficou ativo de verdade. Não está à venda.","ru":"Ты пришёл по приглашению друга и стал по-настоящему активным. Не продаётся."}}'::jsonb, ARRAY['shop2', 'exclusive', 'referral', 'invitee']::text[])
ON CONFLICT (sku) DO NOTHING;

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
