-- Special badges (Özel rozetler).
--
-- 36 collectible badges that sit NEXT TO the country badge on a profile (they never replace it).
-- They cannot be bought with DesCoin: a holder gets one from an admin (direct grant) or from a
-- promo code whose reward is `special_badge` (see 20261026_promo_codes.sql, which calls
-- promo_grant_special_badge below). "Facebook" is admin-only: no promo code can carry it.
-- "#001" (max_holders = 1) belongs to one person at a time; it is released if the holder's
-- account is deleted (special_badge_release_user) or an admin takes it back.
--
-- Additive and idempotent: new tables, functions and seed rows only. Nothing in users,
-- shop_items or the DesCoin tables changes. Every function is service-role only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Catalog.
CREATE TABLE IF NOT EXISTS public.special_badges (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9]{2,32}$'),
  no          integer NOT NULL UNIQUE CHECK (no BETWEEN 1 AND 999),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  tier        text NOT NULL CHECK (tier IN ('tekil', 'efsanevi', 'epik', 'nadir')),
  description text NOT NULL DEFAULT '',
  grant_mode  text NOT NULL DEFAULT 'promo' CHECK (grant_mode IN ('promo', 'admin_only')),
  max_holders integer CHECK (max_holders IS NULL OR max_holders > 0),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2) Who holds what. A revoked row stays for history (revoked_at set); live rows are unique
--    per (user, badge) and per (badge, serial). At most one live, equipped row per user.
CREATE TABLE IF NOT EXISTS public.user_special_badges (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_id           text NOT NULL REFERENCES public.special_badges(id),
  serial             integer NOT NULL CHECK (serial > 0),
  source             text NOT NULL CHECK (source IN ('promo', 'admin')),
  promo_code_id      uuid,
  granted_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  note               text CHECK (note IS NULL OR length(note) <= 280),
  granted_at         timestamptz NOT NULL DEFAULT now(),
  equipped           boolean NOT NULL DEFAULT false,
  equipped_at        timestamptz,
  notified_at        timestamptz,
  revoked_at         timestamptz,
  revoked_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  revoke_reason      text CHECK (revoke_reason IS NULL OR length(revoke_reason) <= 280),
  revoke_notified_at timestamptz,
  CONSTRAINT user_special_badges_equipped_live CHECK (NOT equipped OR revoked_at IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS user_special_badges_live_owner
  ON public.user_special_badges (user_id, badge_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_special_badges_live_serial
  ON public.user_special_badges (badge_id, serial) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_special_badges_one_equipped
  ON public.user_special_badges (user_id) WHERE equipped AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS user_special_badges_badge_live
  ON public.user_special_badges (badge_id, granted_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS user_special_badges_unnotified
  ON public.user_special_badges (user_id) WHERE notified_at IS NULL OR (revoked_at IS NOT NULL AND revoke_notified_at IS NULL);

-- 3) Admin audit trail (grants and take-backs, whoever or whatever caused them).
CREATE TABLE IF NOT EXISTS public.special_badge_audit (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  action     text NOT NULL CHECK (action IN ('grant', 'revoke', 'release')),
  badge_id   text NOT NULL REFERENCES public.special_badges(id),
  user_id    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_id   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  serial     integer,
  source     text,
  promo_code_id uuid,
  note       text
);
CREATE INDEX IF NOT EXISTS special_badge_audit_at ON public.special_badge_audit (at DESC);
CREATE INDEX IF NOT EXISTS special_badge_audit_badge ON public.special_badge_audit (badge_id, at DESC);

ALTER TABLE public.special_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_special_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_badge_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.special_badges, public.user_special_badges, public.special_badge_audit FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.special_badge_audit_id_seq FROM anon, authenticated;

-- 4) Seed: the 36 badges. Re-running refreshes copy and rules but never touches holders.
INSERT INTO public.special_badges (id, no, name, tier, description, grant_mode, max_holders) VALUES
  ('no001', 1, '#001', 'tekil', 'Descall''a ilk kayıt olan hesap. Yalnızca bir kişide olabilir.', 'promo', 1),
  ('kurucu', 2, 'Kurucu', 'efsanevi', 'Descall''ı kuran ekip.', 'promo', NULL),
  ('demironayli', 3, 'Demir Onaylı', 'efsanevi', 'Demir''in elle onayladığı hesaplar.', 'promo', NULL),
  ('og', 4, 'OG', 'efsanevi', '2025''te katılan ilk kullanıcılar.', 'promo', NULL),
  ('efsane', 5, 'Efsane', 'efsanevi', 'Topluluğa iz bırakanlar.', 'promo', NULL),
  ('sonsuz', 6, 'Sonsuz', 'efsanevi', 'Süresiz destekçiler.', 'promo', NULL),
  ('kazanan', 7, 'Kazanan', 'efsanevi', 'Bir Descall turnuvasını kazananlar.', 'promo', NULL),
  ('ilk100', 8, 'İlk 100', 'efsanevi', 'İlk 100 kullanıcı.', 'promo', 100),
  ('alfa', 9, 'Alfa', 'epik', 'Kapalı alfa testine katılanlar.', 'promo', NULL),
  ('v1', 10, 'v1', 'epik', '1.0 sürümünü kullananlar.', 'promo', NULL),
  ('bughunter', 11, 'Bug Hunter', 'epik', 'Onaylanmış hata bildirenler.', 'promo', NULL),
  ('partner', 12, 'Partner', 'epik', 'Resmi iş ortakları.', 'promo', NULL),
  ('yapimci', 13, 'Yapımcı', 'epik', 'Descall için içerik üretenler.', 'promo', NULL),
  ('finalist', 14, 'Finalist', 'epik', 'Turnuva finaline kalanlar.', 'promo', NULL),
  ('turnuva', 15, 'Turnuva', 'epik', 'Bir turnuvaya katılanlar.', 'promo', NULL),
  ('moderator', 16, 'Moderatör', 'epik', 'Topluluk moderatörleri.', 'promo', NULL),
  ('ekip', 17, 'Ekip', 'epik', 'Descall ekibi.', 'promo', NULL),
  ('kayipkod', 18, 'Kayıp Kod', 'epik', 'Gizli kodu bulanlar.', 'promo', NULL),
  ('saat1000', 19, '1000 Saat', 'epik', '1000 saat sesli sohbet.', 'promo', NULL),
  ('sezon1', 20, 'Sezon 1', 'epik', 'Sezon 1''de aktif olanlar.', 'promo', NULL),
  ('beta', 21, 'Beta', 'nadir', 'Açık beta testine katılanlar.', 'promo', NULL),
  ('tester', 22, 'Tester', 'nadir', 'Yeni sürümleri önceden deneyenler.', 'promo', NULL),
  ('oneri', 23, 'Öneri', 'nadir', 'Önerisi uygulamaya girenler.', 'promo', NULL),
  ('destekci', 24, 'Destekçi', 'nadir', 'Descall''ı destekleyenler.', 'promo', NULL),
  ('katkici', 25, 'Katkıcı', 'nadir', 'Çeviri, tasarım ya da kodla katkı verenler.', 'promo', NULL),
  ('dost', 26, 'Dost', 'nadir', 'En az 10 arkadaşı davet edenler.', 'promo', NULL),
  ('yilbasi26', 27, 'Yılbaşı ''26', 'nadir', '31 Aralık 2025 gecesi çevrimiçi olanlar.', 'promo', NULL),
  ('ekim29', 28, '29 Ekim', 'nadir', '29 Ekim''de çevrimiçi olanlar.', 'promo', NULL),
  ('gece', 29, 'Gece Vardiyası', 'nadir', 'Gece 03:00''te sesli kanalda olanlar.', 'promo', NULL),
  ('sessiz', 30, 'Sessiz Dinleyici', 'nadir', 'Konuşmadan 100 saat dinleyenler.', 'promo', NULL),
  ('e404', 31, '404', 'nadir', 'Var olmayan sayfayı bulanlar.', 'promo', NULL),
  ('glitch', 32, 'Glitch', 'nadir', 'Görsel bir hatayı yakalayanlar.', 'promo', NULL),
  ('yil1', 33, '1. Yıl', 'nadir', 'Hesabı bir yaşını dolduranlar.', 'promo', NULL),
  ('hergun', 34, 'Her Gün', 'nadir', '100 gün aralıksız günlük ödül alanlar.', 'promo', NULL),
  ('ilkarama', 35, 'İlk Arama', 'nadir', 'İlk sesli aramasını yapanlar.', 'promo', NULL),
  ('facebook', 36, 'Facebook', 'nadir', 'Bilen bilir. Satılmaz, kodla da çıkmaz; yalnızca elle verilir.', 'admin_only', NULL)

ON CONFLICT (id) DO UPDATE SET
  no = EXCLUDED.no, name = EXCLUDED.name, tier = EXCLUDED.tier, description = EXCLUDED.description,
  grant_mode = EXCLUDED.grant_mode, max_holders = EXCLUDED.max_holders;

-- 5) Grant. One badge row is locked per call, so serial numbers and the holder limit are
--    decided one grant at a time. Returns {ok, granted, serial, id} or {ok:false, error}.
--    Errors: badge_not_found, badge_inactive, admin_only, user_not_found, owned, taken.
CREATE OR REPLACE FUNCTION public.special_badge_grant(
  p_user_id uuid, p_badge_id text, p_source text, p_actor_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL, p_promo_code_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_badge public.special_badges%ROWTYPE;
  v_serial integer;
  v_id uuid;
  v_live integer;
BEGIN
  IF p_source NOT IN ('promo', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source');
  END IF;
  SELECT * INTO v_badge FROM public.special_badges WHERE id = p_badge_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'badge_not_found'); END IF;
  IF NOT v_badge.active THEN RETURN jsonb_build_object('ok', false, 'error', 'badge_inactive'); END IF;
  IF p_source = 'promo' AND v_badge.grant_mode = 'admin_only' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin_only');
  END IF;
  PERFORM 1 FROM public.users WHERE id = p_user_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'user_not_found'); END IF;

  PERFORM 1 FROM public.user_special_badges
   WHERE user_id = p_user_id AND badge_id = p_badge_id AND revoked_at IS NULL;
  IF FOUND THEN RETURN jsonb_build_object('ok', true, 'granted', false, 'error', 'owned'); END IF;

  IF v_badge.max_holders IS NOT NULL THEN
    -- A deleted account gives a limited badge back before anyone else is refused.
    UPDATE public.user_special_badges b
       SET revoked_at = now(), revoke_reason = 'account_deleted', equipped = false, revoke_notified_at = now()
      FROM public.users u
     WHERE b.badge_id = p_badge_id AND b.revoked_at IS NULL AND u.id = b.user_id AND u.deleted_at IS NOT NULL;
    SELECT count(*) INTO v_live FROM public.user_special_badges WHERE badge_id = p_badge_id AND revoked_at IS NULL;
    IF v_live >= v_badge.max_holders THEN
      RETURN jsonb_build_object('ok', false, 'error', 'taken');
    END IF;
    -- Limited badges reuse the lowest free number (#001 is always serial 1).
    SELECT min(s) INTO v_serial FROM generate_series(1, v_badge.max_holders) s
     WHERE NOT EXISTS (SELECT 1 FROM public.user_special_badges
                        WHERE badge_id = p_badge_id AND serial = s AND revoked_at IS NULL);
  ELSE
    -- Unlimited badges count up and never reuse a number.
    SELECT coalesce(max(serial), 0) + 1 INTO v_serial FROM public.user_special_badges WHERE badge_id = p_badge_id;
  END IF;

  INSERT INTO public.user_special_badges (user_id, badge_id, serial, source, promo_code_id, granted_by, note)
  VALUES (p_user_id, p_badge_id, v_serial, p_source, p_promo_code_id, p_actor_id, nullif(btrim(coalesce(p_note, '')), ''))
  RETURNING id INTO v_id;
  INSERT INTO public.special_badge_audit (action, badge_id, user_id, actor_id, serial, source, promo_code_id, note)
  VALUES ('grant', p_badge_id, p_user_id, p_actor_id, v_serial, p_source, p_promo_code_id, nullif(btrim(coalesce(p_note, '')), ''));
  RETURN jsonb_build_object('ok', true, 'granted', true, 'serial', v_serial, 'id', v_id);
END;
$$;

-- 6) Take back. The holder hears about it (revoke_notified_at stays NULL until delivered).
CREATE OR REPLACE FUNCTION public.special_badge_revoke(
  p_user_id uuid, p_badge_id text, p_actor_id uuid DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.user_special_badges%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.special_badges WHERE id = p_badge_id FOR UPDATE;
  SELECT * INTO v_row FROM public.user_special_badges
   WHERE user_id = p_user_id AND badge_id = p_badge_id AND revoked_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_owned'); END IF;
  UPDATE public.user_special_badges
     SET revoked_at = now(), revoked_by = p_actor_id, equipped = false,
         revoke_reason = nullif(btrim(coalesce(p_reason, '')), '')
   WHERE id = v_row.id;
  INSERT INTO public.special_badge_audit (action, badge_id, user_id, actor_id, serial, source, note)
  VALUES ('revoke', p_badge_id, p_user_id, p_actor_id, v_row.serial, v_row.source, nullif(btrim(coalesce(p_reason, '')), ''));
  RETURN jsonb_build_object('ok', true, 'serial', v_row.serial, 'wasEquipped', v_row.equipped);
END;
$$;

-- 7) Wear one badge (or none: p_badge_id NULL). Only a live, owned badge can be worn.
CREATE OR REPLACE FUNCTION public.special_badge_equip(p_user_id uuid, p_badge_id text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev text;
BEGIN
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  SELECT badge_id INTO v_prev FROM public.user_special_badges
   WHERE user_id = p_user_id AND equipped AND revoked_at IS NULL;
  IF p_badge_id IS NOT NULL THEN
    PERFORM 1 FROM public.user_special_badges
     WHERE user_id = p_user_id AND badge_id = p_badge_id AND revoked_at IS NULL;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_owned'); END IF;
  END IF;
  UPDATE public.user_special_badges SET equipped = false
   WHERE user_id = p_user_id AND equipped AND revoked_at IS NULL
     AND badge_id IS DISTINCT FROM p_badge_id;
  IF p_badge_id IS NOT NULL THEN
    UPDATE public.user_special_badges SET equipped = true, equipped_at = now()
     WHERE user_id = p_user_id AND badge_id = p_badge_id AND revoked_at IS NULL AND NOT equipped;
  END IF;
  RETURN jsonb_build_object('ok', true, 'equipped', p_badge_id, 'previous', v_prev);
END;
$$;

-- 8) Account deletion: every live badge goes back (no notification, the account is gone).
CREATE OR REPLACE FUNCTION public.special_badge_release_user(p_user_id uuid, p_reason text DEFAULT 'account_deleted')
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH gone AS (
    UPDATE public.user_special_badges
       SET revoked_at = now(), equipped = false, revoke_reason = coalesce(p_reason, 'account_deleted'),
           revoke_notified_at = now()
     WHERE user_id = p_user_id AND revoked_at IS NULL
    RETURNING badge_id, serial, source
  ), logged AS (
    INSERT INTO public.special_badge_audit (action, badge_id, user_id, serial, source, note)
    SELECT 'release', badge_id, p_user_id, serial, source, coalesce(p_reason, 'account_deleted') FROM gone
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM logged;
  RETURN v_count;
END;
$$;

-- 9) Promo hook (contract from 20261026_promo_codes.sql): true = granted, false = already
--    owned (promo_redeem turns that into promo:badge_owned). Anything else the code can never
--    give, so it reads as "unavailable": admin-only badges, a full #001, inactive badges.
CREATE OR REPLACE FUNCTION public.promo_grant_special_badge(p_user_id uuid, p_badge_id text, p_code_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.special_badge_grant(p_user_id, p_badge_id, 'promo', NULL, NULL, p_code_id);
  IF coalesce((v_res->>'granted')::boolean, false) THEN RETURN true; END IF;
  IF v_res->>'error' = 'owned' THEN RETURN false; END IF;
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'promo:unavailable';
END;
$$;

-- 10) Backstop for the admin promo form: a code can only carry a badge that promo codes may
--     give (never Facebook, never a limited badge that is already full, e.g. a held #001). The API checks first and answers with a friendly error; this catches anything else.
CREATE OR REPLACE FUNCTION public.special_badge_promo_code_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.reward_type = 'special_badge' THEN
    PERFORM 1 FROM public.special_badges
     WHERE id = NEW.reward_ref AND active AND grant_mode = 'promo'
       AND (max_holders IS NULL OR max_holders > (SELECT count(*) FROM public.user_special_badges h
                                                   WHERE h.badge_id = NEW.reward_ref AND h.revoked_at IS NULL));
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'special_badge:not_promo_grantable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.promo_codes') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS promo_codes_special_badge_check ON public.promo_codes;
    CREATE TRIGGER promo_codes_special_badge_check
      BEFORE INSERT OR UPDATE OF reward_type, reward_ref ON public.promo_codes
      FOR EACH ROW EXECUTE FUNCTION public.special_badge_promo_code_check();
  END IF;
END $$;


-- 11) Read models for the API: the catalog with live holder counts, and the admin KPIs.
CREATE OR REPLACE FUNCTION public.special_badge_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'no', b.no, 'name', b.name, 'tier', b.tier, 'description', b.description,
           'grantMode', b.grant_mode, 'maxHolders', b.max_holders, 'active', b.active,
           'holders', coalesce(h.n, 0)) ORDER BY b.no), '[]'::jsonb)
    FROM public.special_badges b
    LEFT JOIN (SELECT badge_id, count(*) AS n FROM public.user_special_badges
                WHERE revoked_at IS NULL GROUP BY badge_id) h ON h.badge_id = b.id;
$$;

CREATE OR REPLACE FUNCTION public.special_badge_admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_codes integer := 0;
BEGIN
  IF to_regclass('public.promo_codes') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM public.promo_codes
                WHERE reward_type = 'special_badge' AND active AND starts_at <= now()
                  AND (expires_at IS NULL OR expires_at > now())
                  AND (max_uses IS NULL OR used_count < max_uses)$q$ INTO v_codes;
  END IF;
  RETURN jsonb_build_object(
    'catalog', (SELECT count(*) FROM public.special_badges),
    'active', (SELECT count(*) FROM public.special_badges WHERE active),
    'granted', (SELECT count(*) FROM public.user_special_badges WHERE revoked_at IS NULL),
    'equipped', (SELECT count(*) FROM public.user_special_badges WHERE revoked_at IS NULL AND equipped),
    'activeCodes', v_codes);
END;
$$;


-- 12) Read models per person, for admins, and for the deferred "you got / lost a badge" popups.
CREATE OR REPLACE FUNCTION public.special_badge_user_badges(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', b.badge_id, 'serial', b.serial, 'grantedAt', b.granted_at, 'via', b.source,
           'equipped', b.equipped,
           'grantedBy', CASE WHEN g.id IS NULL THEN NULL
                             ELSE jsonb_build_object('id', g.id, 'username', g.username, 'displayName', g.display_name) END)
           ORDER BY b.granted_at DESC), '[]'::jsonb)
    FROM public.user_special_badges b
    JOIN public.users u ON u.id = b.user_id AND u.deleted_at IS NULL
    LEFT JOIN public.users g ON g.id = b.granted_by
   WHERE b.user_id = p_user_id AND b.revoked_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.special_badge_equipped_for(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('userId', b.user_id, 'id', b.badge_id, 'serial', b.serial)), '[]'::jsonb)
    FROM public.user_special_badges b
    JOIN public.special_badges s ON s.id = b.badge_id AND s.active
   WHERE b.user_id = ANY (p_user_ids) AND b.equipped AND b.revoked_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.special_badge_holders(p_badge_id text, p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'serial')::int), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
             'userId', u.id, 'username', u.username, 'displayName', u.display_name, 'avatarUrl', u.avatar_url,
             'serial', b.serial, 'grantedAt', b.granted_at, 'via', b.source, 'equipped', b.equipped, 'note', b.note,
             'grantedBy', CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object('id', g.id, 'username', g.username) END) AS x
      FROM public.user_special_badges b
      JOIN public.users u ON u.id = b.user_id
      LEFT JOIN public.users g ON g.id = b.granted_by
     WHERE b.badge_id = p_badge_id AND b.revoked_at IS NULL
     ORDER BY b.serial
     LIMIT greatest(1, least(coalesce(p_limit, 200), 1000))
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.special_badge_audit_list(p_limit integer DEFAULT 50, p_badge_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'at') DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
             'id', a.id, 'at', a.at, 'action', a.action, 'badgeId', a.badge_id, 'serial', a.serial,
             'source', a.source, 'note', a.note, 'promoCodeId', a.promo_code_id,
             'user', CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object('id', u.id, 'username', u.username) END,
             'actor', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id', c.id, 'username', c.username) END) AS x
      FROM public.special_badge_audit a
      LEFT JOIN public.users u ON u.id = a.user_id
      LEFT JOIN public.users c ON c.id = a.actor_id
     WHERE p_badge_id IS NULL OR a.badge_id = p_badge_id
     ORDER BY a.at DESC, a.id DESC
     LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.special_badge_pending(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'granted', coalesce((SELECT jsonb_agg(jsonb_build_object('rowId', b.id, 'id', b.badge_id, 'serial', b.serial, 'via', b.source,
                                  'from', CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object('id', g.id, 'username', g.username) END)
                                  ORDER BY b.granted_at)
                           FROM public.user_special_badges b LEFT JOIN public.users g ON g.id = b.granted_by
                          WHERE b.user_id = p_user_id AND b.notified_at IS NULL AND b.revoked_at IS NULL), '[]'::jsonb),
    'revoked', coalesce((SELECT jsonb_agg(jsonb_build_object('rowId', b.id, 'id', b.badge_id, 'serial', b.serial, 'reason', b.revoke_reason)
                                  ORDER BY b.revoked_at)
                           FROM public.user_special_badges b
                          WHERE b.user_id = p_user_id AND b.revoked_at IS NOT NULL AND b.revoke_notified_at IS NULL), '[]'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.special_badge_mark_notified(p_user_id uuid, p_row_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a integer;
  v_b integer;
BEGIN
  UPDATE public.user_special_badges SET notified_at = now()
   WHERE user_id = p_user_id AND id = ANY (p_row_ids) AND notified_at IS NULL AND revoked_at IS NULL;
  GET DIAGNOSTICS v_a = ROW_COUNT;
  UPDATE public.user_special_badges SET revoke_notified_at = now(), notified_at = coalesce(notified_at, now())
   WHERE user_id = p_user_id AND id = ANY (p_row_ids) AND revoked_at IS NOT NULL AND revoke_notified_at IS NULL;
  GET DIAGNOSTICS v_b = ROW_COUNT;
  RETURN v_a + v_b;
END;
$$;

REVOKE ALL ON FUNCTION public.special_badge_grant(uuid, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.special_badge_revoke(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.special_badge_equip(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.special_badge_release_user(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_grant_special_badge(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.special_badge_promo_code_check() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.special_badge_catalog() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.special_badge_admin_overview() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.special_badge_user_badges(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.special_badge_equipped_for(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.special_badge_holders(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.special_badge_audit_list(integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.special_badge_pending(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.special_badge_mark_notified(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.special_badges, public.user_special_badges, public.special_badge_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.special_badge_audit_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION public.special_badge_grant(uuid, text, text, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.special_badge_revoke(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.special_badge_equip(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.special_badge_release_user(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_grant_special_badge(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.special_badge_catalog() TO service_role;
GRANT EXECUTE ON FUNCTION public.special_badge_admin_overview() TO service_role;
GRANT EXECUTE ON FUNCTION public.special_badge_user_badges(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.special_badge_equipped_for(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.special_badge_holders(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.special_badge_audit_list(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.special_badge_pending(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.special_badge_mark_notified(uuid, uuid[]) TO service_role;
