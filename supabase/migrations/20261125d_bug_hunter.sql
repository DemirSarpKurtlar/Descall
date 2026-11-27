-- "Bug Avcısı" (owner request 27 Nov 2026: "gercekten bug bulan kullanicilara bug hunter falan
-- rozeti ver geribildirimde").
--
-- An admin decides, in Admin > Geri Bildirim, that a feedback item is a REAL bug ("Gerçek bug
-- olarak doğrula": severity düşük / orta / yüksek / kritik, optional note). The first reporter
-- of a bug gets the credit; a later report of the same bug can be linked to it and its sender
-- gets a smaller "also found" credit, counted separately. Credits level up the existing special
-- badge #11 "bughunter" in place (Bug Avcısı I at 1 confirmed bug, II at 5, III at 15); a
-- confirmed critical bug also gives the rare #39 "kritikbug". Each confirmation pays a DesCoin
-- bonus scaled by severity (reason 'bug_bounty', one ledger row per confirmation round). Undo
-- needs a reason; the bonus goes back ('bug_bounty_revoke') only while it is unspent.
-- Backend: frontend/backend/lib/bugHunter/, routes/adminBugHunter.js.
--
-- Additive and idempotent: two new tables, one partial unique index on descoin_ledger, the
-- ledger reason CHECK widened to a strict superset, one new badge catalog row and new copy for
-- badge #11 (id, holders and serial numbers untouched). Service role only (RLS on, no policies).

-- 1) One row per feedback item that an admin confirmed as a real bug. The primary key is the
--    idempotency guard: confirming the same feedback twice changes nothing. An undo keeps the
--    row (undone_at set) so a later re-confirm reuses it and bumps `round`.
CREATE TABLE IF NOT EXISTS public.feedback_bug_reports (
  feedback_id       uuid PRIMARY KEY REFERENCES public.user_feedback(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  severity          text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  credit            text NOT NULL CHECK (credit IN ('first', 'also')),
  -- "also found": the feedback id of the first (root) report of the same bug.
  duplicate_of      uuid REFERENCES public.feedback_bug_reports(feedback_id) ON DELETE SET NULL,
  note              text CHECK (note IS NULL OR length(note) <= 280),
  round             integer NOT NULL DEFAULT 1 CHECK (round >= 1),
  reward            integer NOT NULL DEFAULT 0 CHECK (reward >= 0 AND reward <= 1000),
  -- paid: on the wallet; none: nothing paid (frozen wallet, deleted account); reversed: taken
  -- back on undo; kept: undo found it already spent, so it stayed (logged in İşlem kaydı).
  reward_state      text NOT NULL DEFAULT 'none' CHECK (reward_state IN ('paid', 'none', 'reversed', 'kept')),
  reward_key        text,
  level_after       smallint CHECK (level_after IS NULL OR level_after BETWEEN 0 AND 3),
  confirmed_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_at      timestamptz NOT NULL DEFAULT now(),
  undone_at         timestamptz,
  undone_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  undo_reason       text CHECK (undo_reason IS NULL OR length(undo_reason) <= 300),
  fixed_at          timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- (An "also" row keeps its credit if the root feedback is deleted: duplicate_of goes NULL.)
  CONSTRAINT feedback_bug_reports_not_self CHECK (duplicate_of IS NULL OR duplicate_of <> feedback_id)
);
CREATE INDEX IF NOT EXISTS feedback_bug_reports_user_live
  ON public.feedback_bug_reports (user_id, confirmed_at) WHERE undone_at IS NULL;
CREATE INDEX IF NOT EXISTS feedback_bug_reports_dup
  ON public.feedback_bug_reports (duplicate_of) WHERE duplicate_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS feedback_bug_reports_confirmed
  ON public.feedback_bug_reports (confirmed_at DESC);

-- 2) Per-person totals behind the badge (recounted from feedback_bug_reports after every
--    confirm / undo, so it heals itself). Read by profiles for whoever wears "bughunter".
CREATE TABLE IF NOT EXISTS public.bug_hunter_levels (
  user_id        uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  level          smallint NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 3),
  first_count    integer NOT NULL DEFAULT 0 CHECK (first_count >= 0),
  also_count     integer NOT NULL DEFAULT 0 CHECK (also_count >= 0),
  critical_count integer NOT NULL DEFAULT 0 CHECK (critical_count >= 0),
  since          timestamptz,
  -- Set when THIS feature granted the badge (not a promo code or a hand grant): an undo that
  -- brings the count back to 0 only takes back a badge it gave.
  badge_granted_at    timestamptz,
  critical_granted_at timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bug_hunter_levels_rank
  ON public.bug_hunter_levels (first_count DESC, also_count DESC) WHERE first_count > 0 OR also_count > 0;

ALTER TABLE public.feedback_bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bug_hunter_levels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_bug_reports, public.bug_hunter_levels FROM anon, authenticated;
GRANT ALL ON public.feedback_bug_reports, public.bug_hunter_levels TO service_role;

-- 3) DesCoin: 'bug_bounty' (the bonus) and 'bug_bounty_revoke' (taken back on undo). The live
--    constraint is read and only widened. It can be in either form Postgres prints: an
--    ARRAY['a'::text, ...] (written by IN (...)) or a '{a,b}'::text[] literal (written by the
--    `format(%L)` rebuilds of 20261115_shop_desk.sql and later); the quoted-word regexp of the
--    older migrations reads nothing from the literal form and would leave ANY (NULL::text[]).
--    So both forms are parsed, then joined with every reason the code writes and every reason
--    already in the ledger, so the rebuilt CHECK is always a superset and VALIDATE never fails.
DO $$
DECLARE
  def text;
  reasons text[];
  lit text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conname = 'descoin_ledger_reason_check' AND conrelid = 'public.descoin_ledger'::regclass;
  IF def IS NULL THEN
    RETURN;
  END IF;
  lit := (regexp_match(def, '''\{([^}]*)\}'''))[1];
  IF lit IS NOT NULL THEN
    reasons := string_to_array(replace(lit, '"', ''), ',');
  ELSE
    SELECT array_agg(DISTINCT m[1]) INTO reasons FROM regexp_matches(def, '''([a-z_]+)''', 'g') AS m;
  END IF;
  reasons := coalesce(reasons, ARRAY[]::text[]);
  IF reasons @> ARRAY['bug_bounty', 'bug_bounty_revoke']::text[] THEN
    RETURN;
  END IF;
  SELECT array_agg(DISTINCT r ORDER BY r) INTO reasons FROM (
    SELECT unnest(reasons) AS r
    UNION SELECT unnest(ARRAY[
      'voice_activity', 'screenshare_activity', 'message_activity', 'shop_purchase', 'shop_refund',
      'admin_grant', 'admin_revoke', 'referral_invite', 'referral_welcome', 'referral_milestone',
      'referral_revoke', 'daily_claim', 'streak_bonus', 'promo', 'premium_gift', 'reconcile_adjust',
      'onboarding_reward', 'bug_bounty', 'bug_bounty_revoke'])
    UNION SELECT DISTINCT reason FROM public.descoin_ledger WHERE reason IS NOT NULL
  ) s WHERE r ~ '^[a-z_]{2,40}$';
  ALTER TABLE public.descoin_ledger DROP CONSTRAINT descoin_ledger_reason_check;
  EXECUTE format(
    'ALTER TABLE public.descoin_ledger ADD CONSTRAINT descoin_ledger_reason_check CHECK (reason = ANY (%L::text[])) NOT VALID',
    reasons
  );
  ALTER TABLE public.descoin_ledger VALIDATE CONSTRAINT descoin_ledger_reason_check;
END $$;

-- One bonus (and at most one take-back) per confirmation round, whatever path writes it:
-- meta.idempotency_key is "bug_bounty:<feedback id>:<round>" (":revoke" for the take-back).
CREATE UNIQUE INDEX IF NOT EXISTS descoin_ledger_bug_bounty_key
  ON public.descoin_ledger ((meta ->> 'idempotency_key'))
  WHERE reason IN ('bug_bounty', 'bug_bounty_revoke');

-- 4) Badges. #11 keeps its id, holders and serials; only the copy changes (the apps read names
--    from the locale files first). #39 "Kritik Bug Avcısı" is admin-only: no promo code can
--    carry it; the server grants it when an admin confirms a critical bug.
UPDATE public.special_badges
   SET name = 'Bug Avcısı', description = 'Geri bildirimde gerçek bir hata bulanlar.'
 WHERE id = 'bughunter';

INSERT INTO public.special_badges (id, no, name, tier, description, grant_mode, max_holders) VALUES
  ('kritikbug', 39, 'Kritik Bug Avcısı', 'efsanevi', 'Kritik bir hatayı ilk bildirenler.', 'admin_only', NULL)
ON CONFLICT (id) DO UPDATE SET
  no = EXCLUDED.no, name = EXCLUDED.name, tier = EXCLUDED.tier, description = EXCLUDED.description,
  grant_mode = EXCLUDED.grant_mode, max_holders = EXCLUDED.max_holders;
