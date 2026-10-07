-- iOS App Store readiness (2.9.117). Additive only: new nullable columns and a
-- partial unique index. No existing row or value is changed or removed.
--   birth_date            age gate (13+ to register, 18+ for casino games)
--   terms_accepted_at     Terms / community guidelines acceptance (App Review 1.2)
--   apple_sub             stable Sign in with Apple user id
--   deletion_requested_at account deletion requested; hard-deleted after 14 days
--   deleted_at            set when the account was anonymized/deleted
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS apple_sub text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS users_apple_sub_key ON public.users (apple_sub) WHERE apple_sub IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_deletion_requested_at_idx ON public.users (deletion_requested_at) WHERE deletion_requested_at IS NOT NULL;
