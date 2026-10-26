-- Promo admin "Seçilenler" people picker: ranked, Turkish-folded user search.
-- Additive and idempotent (CREATE OR REPLACE + REVOKE/GRANT only; no table,
-- column or index change). Service role only; returns no sensitive fields.
-- The JS twin of the ranking is backend/lib/promoUserSearch.js (same tiers;
-- the route falls back to it when this function is not deployed yet).

-- Case- and accent-insensitive key for Turkish text: İ/I/ı/i → i, ş → s, ğ → g,
-- ü → u, ö → o, ç → c, â/î/û → a/i/u, then lower().
CREATE OR REPLACE FUNCTION public.promo_fold(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT lower(translate(coalesce(p, ''), 'İIıŞşĞğÜüÖöÇçÂâÎîÛû', 'iiissgguuooccaaiiuu'))
$$;

-- Tiers: 0 exact, 1 username prefix, 2 name prefix, 3 word prefix (name or
-- username part after . _ - or space), 4 username contains, 5 name contains,
-- 6 letters in order from the start of a word (3+ letters). Ties: shorter username, then alphabetical.
-- Banned and deleted accounts are never suggested (they cannot redeem).
CREATE OR REPLACE FUNCTION public.promo_admin_user_search(p_q text, p_exclude uuid[] DEFAULT '{}', p_limit integer DEFAULT 8)
RETURNS TABLE (id uuid, username text, display_name text, avatar_url text, rank integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH q AS (
    SELECT f AS fq,
           replace(f, ' ', '') AS fz,
           (SELECT string_agg(CASE WHEN ch IN ('%', '_', '\') THEN '\' || ch ELSE ch END, '%')
              FROM regexp_split_to_table(replace(f, ' ', ''), '') AS ch) || '%' AS sub
      FROM (SELECT public.promo_fold(regexp_replace(btrim(regexp_replace(left(coalesce(p_q, ''), 64), '^\s*@+', '')), '\s+', ' ', 'g')) AS f) s
  ),
  c AS (
    SELECT u.id, u.username, u.display_name, u.avatar_url,
           public.promo_fold(u.username) AS fu,
           public.promo_fold(coalesce(u.display_name, '')) AS fd
      FROM public.users u
     WHERE u.deleted_at IS NULL
       AND coalesce(u.is_banned, false) = false
       AND NOT (u.id = ANY (coalesce(p_exclude, '{}'::uuid[])))
  ),
  r AS (
    SELECT c.id, c.username, c.display_name, c.avatar_url,
           CASE
             WHEN c.fu = q.fq OR c.fd = q.fq THEN 0
             WHEN left(c.fu, length(q.fq)) = q.fq THEN 1
             WHEN left(c.fd, length(q.fq)) = q.fq THEN 2
             WHEN position(' ' || q.fq IN ' ' || translate(c.fd, '._-', '   ')) > 0
               OR position(' ' || q.fq IN ' ' || translate(c.fu, '._-', '   ')) > 0 THEN 3
             WHEN length(q.fq) >= 2 AND position(q.fq IN c.fu) > 0 THEN 4
             WHEN length(q.fq) >= 2 AND position(q.fq IN c.fd) > 0 THEN 5
             WHEN length(q.fz) >= 3 AND (c.fu LIKE q.sub
               OR ' ' || translate(c.fu, '._-', '   ') LIKE '% ' || q.sub
               OR ' ' || translate(c.fd, '._-', '   ') LIKE '% ' || q.sub) THEN 6
           END AS rank
      FROM c, q
     WHERE q.fq <> ''
  )
  SELECT r.id, r.username, r.display_name, r.avatar_url, r.rank
    FROM r
   WHERE r.rank IS NOT NULL
   ORDER BY r.rank, length(r.username), r.username
   LIMIT greatest(1, least(coalesce(p_limit, 8), 20))
$$;

REVOKE ALL ON FUNCTION public.promo_fold(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_admin_user_search(text, uuid[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promo_fold(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_admin_user_search(text, uuid[], integer) TO service_role;
