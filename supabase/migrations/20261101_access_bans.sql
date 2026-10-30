-- Erişim yasakları (3.5.0, owner list 3.5: "IP / cihaz yasağı, yeni gelişmiş sekme").
-- Blocks an IP address, a network (IPv4 /24, IPv6 /64) or a device from signing
-- in, signing up and connecting. Raw addresses / device ids are never stored:
-- `hash` is a keyed HMAC (backend/lib/accessBans.js), `label` a masked form for
-- the admin screen ("88.230.x.x"). Backend-only (service role); RLS on, no
-- anon / authenticated grants. Additive, safe to re-run.
CREATE TABLE IF NOT EXISTS public.access_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('ip', 'network', 'device')),
  hash text NOT NULL CHECK (char_length(hash) BETWEEN 16 AND 128),
  label text NOT NULL CHECK (char_length(label) <= 120),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 300),
  source_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  source_username text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_by_username text,
  hits integer NOT NULL DEFAULT 0,
  last_hit_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_access_bans_active ON public.access_bans (kind, hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_access_bans_created ON public.access_bans (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_bans_source ON public.access_bans (source_user_id) WHERE source_user_id IS NOT NULL;

-- Blocked attempts (masked address only), kept 90 days.
CREATE TABLE IF NOT EXISTS public.access_ban_hits (
  id bigserial PRIMARY KEY,
  ban_id uuid NOT NULL REFERENCES public.access_bans(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('login', 'register', 'socket', 'oauth')),
  ip_masked text,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_access_ban_hits_at ON public.access_ban_hits (at DESC);
CREATE INDEX IF NOT EXISTS idx_access_ban_hits_ban ON public.access_ban_hits (ban_id, at DESC);

CREATE OR REPLACE FUNCTION public.access_ban_touch(p_ban uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER AS $$
  UPDATE public.access_bans SET hits = hits + 1, last_hit_at = now() WHERE id = p_ban;
$$;

ALTER TABLE public.access_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_ban_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.access_bans, public.access_ban_hits FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.access_ban_touch(uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.access_bans, public.access_ban_hits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.access_ban_hits_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION public.access_ban_touch(uuid) TO service_role;
