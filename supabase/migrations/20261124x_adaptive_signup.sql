-- Uyarlanan kart (growth draft 1B): the email-first sign-in / sign-up card.
-- Additive only. The backend works without it (it drops the column and keeps the row).
--
-- signup_attempts.flow: which form the attempt came from, so Kayıt İstatistikleri can
-- compare the new card ("card") with the older forms still in apps that did not update
-- ("classic"). NULL for rows written before this migration.
ALTER TABLE public.signup_attempts
  ADD COLUMN IF NOT EXISTS flow TEXT;
-- NOT VALID: the column starts empty, nothing to scan; new rows are checked.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signup_attempts_flow_chk') THEN
    ALTER TABLE public.signup_attempts
      ADD CONSTRAINT signup_attempts_flow_chk
      CHECK (flow IS NULL OR flow IN ('card', 'classic')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS signup_attempts_flow_created_idx
  ON public.signup_attempts (flow, created_at DESC)
  WHERE flow IS NOT NULL;

-- The card's Ölçüm events (identifier_routed, breach_warned_inline, breach_fixed) are rows
-- of analytics_events; analytics_events_event_time_idx (event, occurred_at DESC) already
-- serves the admin range query. Accounts created without a password (passkey) use
-- users.auth_provider = 'passkey' and users.auth_method = 'passkey' (no constraint on
-- either column), password_hash NULL like a Google account.
