-- Authenticator-app two-factor (3.2.0). Backend-only columns (service role);
-- the API never selects them into a client payload.
--   totp_secret_enc       AES-256-GCM blob of the active secret (lib/totp.js)
--   totp_pending_enc      secret shown during setup, until the first code confirms it
--   totp_pending_at       when setup started (pending secrets expire after 15 minutes)
--   totp_enabled_at       set = the account uses the authenticator app for 2FA
--   totp_last_counter     30 s step of the last accepted code (replay protection)
--   totp_recovery_hashes  HMAC hashes of unused single-use recovery codes
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS totp_secret_enc text,
  ADD COLUMN IF NOT EXISTS totp_pending_enc text,
  ADD COLUMN IF NOT EXISTS totp_pending_at timestamptz,
  ADD COLUMN IF NOT EXISTS totp_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS totp_last_counter bigint,
  ADD COLUMN IF NOT EXISTS totp_recovery_hashes text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.users.totp_secret_enc IS 'Encrypted TOTP secret; never send to clients.';
COMMENT ON COLUMN public.users.totp_recovery_hashes IS 'HMAC hashes of unused recovery codes; never send to clients.';
