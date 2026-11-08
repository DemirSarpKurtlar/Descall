-- Sign-up form + measurement (Kayıt İstatistikleri). ADDITIVE ONLY: new nullable
-- columns, no existing column is altered, nothing is dropped or rewritten. The backend
-- works before this runs (it retries without these columns). The CHECKs are NOT VALID:
-- every column starts empty, so there is nothing to scan; new rows are still checked.

-- Which rule stopped a failed POST /auth/register (backend/lib/signupRules.js codes,
-- e.g. password_short, username_chars, email_taken). The coarse `reason` stays as it was.
ALTER TABLE public.signup_attempts
  ADD COLUMN IF NOT EXISTS reason_detail text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signup_attempts_reason_detail_chk') THEN
    ALTER TABLE public.signup_attempts
      ADD CONSTRAINT signup_attempts_reason_detail_chk
      CHECK (reason_detail IS NULL OR reason_detail ~ '^[a-z0-9_]{1,40}$') NOT VALID;
  END IF;
END $$;

-- Optional "How did you hear about us?" answer, asked once after sign-up
-- (google, ai_assistant, instagram, tiktok, youtube, friend, discord, forum, other, skipped).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS heard_about text,
  ADD COLUMN IF NOT EXISTS heard_about_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_heard_about_chk') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_heard_about_chk
      CHECK (heard_about IS NULL OR heard_about ~ '^[a-z_]{1,24}$') NOT VALID;
  END IF;
END $$;

-- The invite that brought a new account: server:<code>, vanity:<slug>, group:<code> or
-- friend:<username> (backend/lib/inviteAttribution.js). users.referred_by keeps the inviter id.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS joined_via_invite_code text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_joined_via_invite_code_chk') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_joined_via_invite_code_chk
      CHECK (joined_via_invite_code IS NULL OR char_length(joined_via_invite_code) <= 80) NOT VALID;
  END IF;
END $$;
