-- Yönetici Paneli › Sistem (remake, owner-approved Draft A "Kontrol merkezi", Nov 2026).
--
-- system_boots: one row per backend process start. A heartbeat moves last_beat_at
--   every 15 s; the next start reads the previous row to work out the downtime and why
--   it happened (admin = Güvenli yeniden başlat, deploy = a new commit, auto = anything
--   else). The safe restart writes exit_* on the running row before the process exits.
--   Feeds "Son yeniden başlatmalar" and the availability figure on the uptime tile.
-- system_metrics_daily: peak connected sockets and edge sockets per day (Istanbul day),
--   for the 14-day Edge realtime chart.
--
-- Only the backend reads and writes them with the service role: RLS on, no policies,
-- no anon / authenticated grants. Additive, safe to re-run. Until it is applied the
-- page still works: restart history and the 14-day chart show only this process.

CREATE TABLE IF NOT EXISTS public.system_boots (
  id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_beat_at timestamptz NOT NULL DEFAULT now(),
  commit text,
  version text,
  prev_boot_id uuid,
  downtime_sec integer CHECK (downtime_sec IS NULL OR downtime_sec >= 0),
  cause text NOT NULL DEFAULT 'auto' CHECK (cause IN ('first', 'admin', 'deploy', 'auto')),
  exit_at timestamptz,
  exit_by_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  exit_by_username text,
  exit_reason text,
  exit_meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_system_boots_started ON public.system_boots (started_at DESC);

CREATE TABLE IF NOT EXISTS public.system_metrics_daily (
  day date PRIMARY KEY,
  peak_sockets integer NOT NULL DEFAULT 0 CHECK (peak_sockets >= 0),
  peak_edge integer NOT NULL DEFAULT 0 CHECK (peak_edge >= 0),
  peak_rss_mb integer NOT NULL DEFAULT 0 CHECK (peak_rss_mb >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_boots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_metrics_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_boots FROM anon, authenticated;
REVOKE ALL ON TABLE public.system_metrics_daily FROM anon, authenticated;
GRANT ALL ON TABLE public.system_boots TO service_role;
GRANT ALL ON TABLE public.system_metrics_daily TO service_role;

-- Flag drawer "Değişiklik geçmişi" filters the shared settings history by key
-- (changes @> '[{"key": "featureFlags.desktopGlass"}]'). Only when that table exists
-- (supabase/migrations/20261115_security_center.sql).
DO $$
BEGIN
  IF to_regclass('public.security_setting_changes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_security_setting_changes_changes
      ON public.security_setting_changes USING gin (changes jsonb_path_ops);
  END IF;
END $$;
