-- Google Search Console query data (SEO audit item 6, Nov 2026). Filled once a day by
-- .github/workflows/search-console-sync.yml (frontend/scripts/search-console-sync.mjs),
-- which upserts the last 28 days of searchanalytics.query rows with the service role.
-- Owner steps: docs/ops/search-console-sync.md.
-- Additive only. RLS on, no policies, no grants to anon / authenticated: only the service
-- role (the sync job and the backend) reads and writes it.

CREATE TABLE IF NOT EXISTS public.seo_search_console_daily (
  date date NOT NULL,
  query text NOT NULL,
  page text NOT NULL,
  country text NOT NULL,
  device text NOT NULL,
  clicks integer NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  impressions integer NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  ctr double precision NOT NULL DEFAULT 0,
  position double precision NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, query, page, country, device)
);

-- Top queries / pages over a date range.
CREATE INDEX IF NOT EXISTS seo_search_console_daily_date_idx
  ON public.seo_search_console_daily (date DESC);
CREATE INDEX IF NOT EXISTS seo_search_console_daily_page_idx
  ON public.seo_search_console_daily (page, date DESC);

ALTER TABLE public.seo_search_console_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seo_search_console_daily FROM anon, authenticated;

COMMENT ON TABLE public.seo_search_console_daily IS
  'Search Console searchanalytics.query rows (date, query, page, country, device); synced daily by GitHub Actions. Service role only.';
