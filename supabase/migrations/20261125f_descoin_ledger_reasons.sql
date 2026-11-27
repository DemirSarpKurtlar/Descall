-- DesCoin ledger reasons for the growth wave (27 Nov 2026). Additive: the allowed set only grows.
--
-- The CHECK on descoin_ledger.reason did not allow the reasons the new code writes, so those
-- credits failed with 23514: onboarding_reward (Başla panosu, already live), referral_milestone /
-- referral_revoke (Davet Merkezi), reengage_task / winback_call / winback_gift (Önce insanlar),
-- bug_bounty / bug_bounty_revoke (Bug Hunter).
--
-- The constraint is rebuilt as a superset of: what it allows today (both stored forms are parsed:
-- the quoted-word form of the older migrations and the '{a,b}'::text[] literal that format(%L)
-- rebuilds produce), every reason the code writes, and every reason already in the ledger. So
-- VALIDATE can never fail and running this again (or after other rebuilds) is safe.
DO $$
DECLARE
  def text;
  current_reasons text[] := ARRAY[]::text[];
  lit text;
  reasons text[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conname = 'descoin_ledger_reason_check' AND conrelid = 'public.descoin_ledger'::regclass;
  IF def IS NOT NULL THEN
    lit := (regexp_match(def, '''\{([^}]*)\}'''))[1];
    IF lit IS NOT NULL THEN
      current_reasons := string_to_array(replace(lit, '"', ''), ',');
    ELSE
      SELECT coalesce(array_agg(DISTINCT m[1]), ARRAY[]::text[]) INTO current_reasons
        FROM regexp_matches(def, '''([a-z_]+)''', 'g') AS m;
    END IF;
  END IF;

  SELECT array_agg(DISTINCT r ORDER BY r) INTO reasons FROM (
    SELECT unnest(current_reasons) AS r
    UNION SELECT unnest(ARRAY[
      'admin_grant', 'admin_revoke', 'daily_claim', 'message_activity', 'premium_gift', 'promo',
      'reconcile_adjust', 'referral_invite', 'referral_welcome', 'screenshare_activity',
      'shop_purchase', 'shop_refund', 'streak_bonus', 'voice_activity',
      'onboarding_reward',
      'referral_milestone', 'referral_revoke',
      'reengage_task', 'winback_call', 'winback_gift',
      'bug_bounty', 'bug_bounty_revoke'])
    UNION SELECT DISTINCT reason FROM public.descoin_ledger WHERE reason IS NOT NULL
  ) s WHERE r ~ '^[a-z_]{2,40}$';

  IF def IS NOT NULL THEN
    ALTER TABLE public.descoin_ledger DROP CONSTRAINT descoin_ledger_reason_check;
  END IF;
  EXECUTE format(
    'ALTER TABLE public.descoin_ledger ADD CONSTRAINT descoin_ledger_reason_check CHECK (reason = ANY (%L::text[])) NOT VALID',
    reasons
  );
  ALTER TABLE public.descoin_ledger VALIDATE CONSTRAINT descoin_ledger_reason_check;
END $$;
