-- Sign in with Apple: encrypted refresh token (AES-256-GCM, lib/ai/cryptoKeys) so the
-- Apple grant can be revoked when the account is deleted. Additive, nullable.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS apple_refresh_token text;
