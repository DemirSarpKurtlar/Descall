"use strict";

/**
 * Read every row of a PostgREST select past the 1000-row cap (polish admin-b-04).
 * `.limit(20000)` does not lift the cap: the server still returns at most 1000 rows.
 *
 * `build()` must return a fresh query with a stable `.order()` (unordered pages can
 * repeat or skip rows). The first page asks for the exact count; the rest are read
 * a few at a time in parallel. Resolves `{ data, error, count, capped }` like a
 * supabase query, so callers can keep `withTimeout` fallbacks.
 *
 * @param {() => any} build
 * @param {{ pageSize?: number, maxRows?: number, parallel?: number }} [opts]
 */
async function selectPaged(build, { pageSize = 1000, maxRows = 200000, parallel = 4 } = {}) {
  const first = await build().range(0, pageSize - 1);
  if (first?.error) return { data: null, error: first.error, count: null, capped: false };
  const rows = [...(first?.data || [])];
  if (rows.length < pageSize) return { data: rows, error: null, count: rows.length, capped: false };
  const total = Number.isFinite(first?.count) ? first.count : null;
  const want = Math.min(total == null ? maxRows : total, maxRows);
  let from = pageSize;
  while (from < want) {
    const batch = [];
    for (let i = 0; i < parallel && from < want; i += 1, from += pageSize) {
      batch.push(build().range(from, Math.min(from + pageSize, want) - 1));
    }
    const pages = await Promise.all(batch);
    let short = false;
    for (const page of pages) {
      if (page?.error) return { data: null, error: page.error, count: total, capped: false };
      const got = page?.data || [];
      rows.push(...got);
      if (got.length < pageSize) short = true;
    }
    if (short && total == null) break;
  }
  return { data: rows, error: null, count: total ?? rows.length, capped: (total ?? rows.length) > maxRows };
}

module.exports = { selectPaged };
