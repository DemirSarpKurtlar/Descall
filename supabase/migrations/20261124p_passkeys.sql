-- Passkeys (WebAuthn) on every platform (owner item 9, Nov 2026).
--
-- The password always stays: a passkey is an additional, faster way to sign in. A sign-in
-- with a passkey that verified the user (PIN, fingerprint, face) counts as strong
-- authentication and skips the e-mail / authenticator second step; without user
-- verification it never opens a session on its own (routes/passkeys.js).
--
-- passkey_credentials: one row per registered passkey. credential_id and public_key are
--   base64url (the COSE public key), sign_count is the last authenticator counter (a
--   counter that goes backwards marks the key as possibly cloned: suspended_at is set and
--   the key no longer signs in until the owner removes it). aaguid names the provider
--   (iCloud Keychain, Google Password Manager, Windows Hello, ...), backup_eligible /
--   backup_state are the BE / BS flags (synced passkey or a single-device key). platform
--   is where it was created (web, ios, android, windows, electron).
-- passkey_challenges: single-use WebAuthn challenges with a short expiry (5 minutes, the
--   backend deletes a row when it is used and prunes expired rows). Multi-node safe
--   (Render + the PC node share the database, not memory).
-- passkey_handoffs: the desktop browser handoff (Electron, and the Tauri app on Windows
--   older than 1903): the app opens https://descall.com/passkey/desktop with a one-time
--   code in the URL fragment, the browser completes the passkey ceremony and the app,
--   which alone knows the poll secret, collects the result. Only SHA-256 hashes of the
--   code and of the poll secret are stored; no session token is ever stored here (the
--   session is created when the app collects it).
--
-- Session metadata: users.active_sessions entries (jsonb, lib/sessions.js) now carry
--   "method" (password, passkey, google, apple, 2fa_totp, 2fa_email, ...). No DDL needed.
--
-- Only the backend reads and writes these tables with the service role: RLS on, no
-- policies, no anon / authenticated grants. Additive, safe to re-run. Until it is applied
-- the passkey endpoints answer 503 PASSKEYS_UNAVAILABLE and every client hides the feature.

CREATE TABLE IF NOT EXISTS public.passkey_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  credential_id text NOT NULL CHECK (credential_id ~ '^[A-Za-z0-9_-]{16,1400}$'),
  public_key text NOT NULL CHECK (char_length(public_key) BETWEEN 16 AND 4096),
  sign_count bigint NOT NULL DEFAULT 0 CHECK (sign_count >= 0),
  transports text[] NOT NULL DEFAULT '{}',
  aaguid text,
  device_type text CHECK (device_type IS NULL OR device_type IN ('singleDevice', 'multiDevice')),
  backup_eligible boolean NOT NULL DEFAULT false,
  backup_state boolean NOT NULL DEFAULT false,
  attestation_fmt text,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 64),
  platform text CHECK (platform IS NULL OR platform IN ('web', 'ios', 'android', 'windows', 'electron', 'macos', 'linux', 'other')),
  created_device text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  last_used_platform text,
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  suspended_at timestamptz,
  suspended_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS passkey_credentials_credential_id_uidx ON public.passkey_credentials (credential_id);
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user ON public.passkey_credentials (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.passkey_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge text NOT NULL CHECK (challenge ~ '^[A-Za-z0-9_-]{32,128}$'),
  purpose text NOT NULL CHECK (purpose IN ('register', 'authenticate', 'reauth')),
  user_id uuid REFERENCES public.users (id) ON DELETE CASCADE,
  session_id text,
  handoff_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS passkey_challenges_challenge_uidx ON public.passkey_challenges (challenge);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires ON public.passkey_challenges (expires_at);

CREATE TABLE IF NOT EXISTS public.passkey_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('signin', 'register')),
  code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  poll_hash text NOT NULL CHECK (poll_hash ~ '^[0-9a-f]{64}$'),
  match_code text NOT NULL CHECK (match_code ~ '^[0-9]{4}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'consumed', 'failed')),
  user_id uuid REFERENCES public.users (id) ON DELETE CASCADE,
  session_id text,
  platform text,
  credential_row_id uuid REFERENCES public.passkey_credentials (id) ON DELETE SET NULL,
  user_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  consumed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS passkey_handoffs_code_hash_uidx ON public.passkey_handoffs (code_hash);
CREATE UNIQUE INDEX IF NOT EXISTS passkey_handoffs_poll_hash_uidx ON public.passkey_handoffs (poll_hash);
CREATE INDEX IF NOT EXISTS idx_passkey_handoffs_expires ON public.passkey_handoffs (expires_at);

ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_handoffs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.passkey_credentials FROM anon, authenticated;
REVOKE ALL ON TABLE public.passkey_challenges FROM anon, authenticated;
REVOKE ALL ON TABLE public.passkey_handoffs FROM anon, authenticated;

COMMENT ON TABLE public.passkey_credentials IS 'WebAuthn passkeys (routes/passkeys.js). Public keys only; backend service role only.';
COMMENT ON TABLE public.passkey_challenges IS 'Single-use WebAuthn challenges, 5 minute expiry; backend service role only.';
COMMENT ON TABLE public.passkey_handoffs IS 'Desktop browser passkey handoff (hashed one-time code + poll secret); never stores a session token.';
