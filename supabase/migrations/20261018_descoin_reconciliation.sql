-- 2.11.2: daily read-only DesCoin reconciliation (users.descoin_balance vs SUM(descoin_ledger.amount)).
-- Additive only. The snapshot function is STABLE (Postgres rejects any write inside it) and the
-- backend calls it over PostgREST GET, which runs in a READ ONLY transaction. Balances are never
-- modified by this job; results go to descoin_reconciliation_runs (admin panel + alert log).

CREATE TABLE IF NOT EXISTS public.descoin_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  trigger text NOT NULL DEFAULT 'cron',
  triggered_by uuid,
  users_checked integer NOT NULL DEFAULT 0,
  ledger_rows bigint NOT NULL DEFAULT 0,
  mismatch_count integer NOT NULL DEFAULT 0,
  no_ledger_count integer NOT NULL DEFAULT 0,
  last_row_mismatch_count integer NOT NULL DEFAULT 0,
  abs_drift bigint NOT NULL DEFAULT 0,
  mismatches jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text
);
CREATE INDEX IF NOT EXISTS idx_descoin_reconciliation_runs_started
  ON public.descoin_reconciliation_runs (started_at DESC);
ALTER TABLE public.descoin_reconciliation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.descoin_reconciliation_runs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.descoin_reconciliation_snapshot(max_rows integer DEFAULT 500)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH sums AS (
    SELECT user_id, SUM(amount)::bigint AS total, COUNT(*)::bigint AS n
    FROM public.descoin_ledger GROUP BY user_id
  ), last_row AS (
    SELECT DISTINCT ON (user_id) user_id, balance_after
    FROM public.descoin_ledger ORDER BY user_id, created_at DESC, id DESC
  ), joined AS (
    SELECT u.id AS user_id, u.descoin_balance AS balance,
           COALESCE(s.total, 0) AS ledger_sum, COALESCE(s.n, 0) AS ledger_rows,
           l.balance_after AS last_balance_after
    FROM public.users u
    LEFT JOIN sums s ON s.user_id = u.id
    LEFT JOIN last_row l ON l.user_id = u.id
  ), bad AS (
    SELECT *, (balance - ledger_sum) AS drift FROM joined WHERE balance <> ledger_sum
  )
  SELECT jsonb_build_object(
    'users_checked', (SELECT COUNT(*) FROM joined),
    'ledger_rows', (SELECT COUNT(*) FROM public.descoin_ledger),
    'mismatch_count', (SELECT COUNT(*) FROM bad),
    'no_ledger_count', (SELECT COUNT(*) FROM bad WHERE ledger_rows = 0),
    'last_row_mismatch_count', (SELECT COUNT(*) FROM joined WHERE ledger_rows > 0 AND balance <> last_balance_after),
    'abs_drift', (SELECT COALESCE(SUM(ABS(drift)), 0) FROM bad),
    'mismatches', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY ABS(b.drift) DESC, b.user_id)
      FROM (SELECT * FROM bad ORDER BY ABS(drift) DESC, user_id LIMIT GREATEST(1, LEAST(max_rows, 2000))) b
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.descoin_reconciliation_snapshot(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descoin_reconciliation_snapshot(integer) TO service_role;
