-- Hibrit sunucu: Descall Node automatic setup (Nov 2026).
--
-- The PC app fetches the environment it needs from the primary with its node key
-- (POST /api/node/bootstrap). A key may do that only inside its enrollment window:
--   bootstrap_until  end of the window the owner set in Admin > Sunucu Ağı ("Kurulum
--                    penceresini aç": now + 30 min; closing it early sets it to now). NULL:
--                    the window is created_at + 30 min.
--   bootstrapped_at  the last time the key fetched the environment (the node_events row and
--                    the admin audit entry are the full record).
--
-- Additive only, safe to re-run. Until it is applied the backend uses created_at + 30 min
-- and the "open the setup window" action answers BOOTSTRAP_UNAVAILABLE; nothing else changes.

ALTER TABLE public.node_keys ADD COLUMN IF NOT EXISTS bootstrap_until timestamptz;
ALTER TABLE public.node_keys ADD COLUMN IF NOT EXISTS bootstrapped_at timestamptz;
