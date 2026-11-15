-- Oyunlar / Kredi (admin remake, owner pick Draft B "Oyuncu çalışma alanı", Nov 2026).
-- Game credits are points only: never money, never DesCoin, never convertible.
--
--   credit_ledger            every change of a wallet in user_credits (hand results,
--                            daily bonus, !pay transfers, admin adjustments, resets)
--                            with the balance after it, so the admin page can show a
--                            running balance.
--   credit_transfers         one row per !pay transfer (sender, recipient, amount, chat).
--   user_game_limits         personal limits (max credits per hand, daily loss cap,
--                            daily hand count, transfers off, temporary freeze) and the
--                            leaderboard hide flag. Enforced in socket/gameHandlers.js.
--   user_game_limit_history  every change of those limits (who, why, before / after).
--
-- Only the backend reads and writes them with the service role: RLS on, no
-- policies, no anon / authenticated grants. Additive, safe to re-run. Until it is
-- applied the admin page falls back to game_history and the limits dialog answers
-- 503 LIMITS_UNAVAILABLE; games keep working without limits.

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('game', 'daily', 'transfer_in', 'transfer_out', 'admin', 'reset')),
  game_type text,
  result text,
  bet integer,
  delta integer NOT NULL,
  balance_after integer,
  ref_id text,
  counterparty_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_username text,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  category text,
  context_kind text,
  context_id text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created ON public.credit_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_kind_created ON public.credit_ledger (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_created ON public.credit_ledger (created_at DESC);

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.credit_ledger FROM anon, authenticated;
GRANT ALL ON TABLE public.credit_ledger TO service_role;

CREATE TABLE IF NOT EXISTS public.credit_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  context_kind text,
  context_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transfers_from ON public.credit_transfers (from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transfers_to ON public.credit_transfers (to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transfers_created ON public.credit_transfers (created_at DESC);

ALTER TABLE public.credit_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.credit_transfers FROM anon, authenticated;
GRANT ALL ON TABLE public.credit_transfers TO service_role;

CREATE TABLE IF NOT EXISTS public.user_game_limits (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  max_bet integer CHECK (max_bet IS NULL OR max_bet > 0),
  daily_loss_cap integer CHECK (daily_loss_cap IS NULL OR daily_loss_cap > 0),
  daily_hand_cap integer CHECK (daily_hand_cap IS NULL OR daily_hand_cap > 0),
  transfers_enabled boolean NOT NULL DEFAULT true,
  frozen_until timestamptz,
  freeze_indefinite boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  auto_lift boolean NOT NULL DEFAULT true,
  leaderboard_hidden boolean NOT NULL DEFAULT false,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  set_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  set_by_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_game_limits_hidden ON public.user_game_limits (leaderboard_hidden) WHERE leaderboard_hidden;

ALTER TABLE public.user_game_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_game_limits FROM anon, authenticated;
GRANT ALL ON TABLE public.user_game_limits TO service_role;

CREATE TABLE IF NOT EXISTS public.user_game_limit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  limits jsonb NOT NULL,
  previous jsonb,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_username text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_game_limit_history_user ON public.user_game_limit_history (user_id, created_at DESC);

ALTER TABLE public.user_game_limit_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_game_limit_history FROM anon, authenticated;
GRANT ALL ON TABLE public.user_game_limit_history TO service_role;
