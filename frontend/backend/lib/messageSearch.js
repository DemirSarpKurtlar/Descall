"use strict";

/**
 * Mesaj araması (3.7.7): pure helpers for routes/search.js. The search runs on
 * the server over the whole history of one conversation the caller can read
 * (same access rules as the history endpoints), not only the loaded page.
 */

const MIN_QUERY = 2;
const MAX_QUERY = 100;

/** Trim, collapse spaces, cap length. "" when too short to search. */
function cleanQuery(raw) {
  const q = String(raw || "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
  return q.length >= MIN_QUERY ? q : "";
}

/**
 * ilike pattern: LIKE wildcards escaped; the Turkish i letters (i, ı, İ, I)
 * become "_" because the database (en_US collation) does not fold İ to i, so
 * "istanbul" would miss "İstanbul". `matches` re-checks every row exactly.
 */
function likePattern(q) {
  const escaped = String(q).replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[iıİI]/g, "_");
  return `%${escaped}%`;
}

/** Text the user wrote, or null for rows that are not searchable text. */
function searchableText(content) {
  const raw = String(content || "").trim();
  if (!raw) return null;
  if (raw.startsWith("__voice__:")) return null;
  if (raw.startsWith("{") && /"type"\s*:\s*"call_summary"/.test(raw)) return null;
  return raw;
}

const fold = (s) => String(s || "").toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * A short window around the first match: { text, start, end } where text[start, end)
 * is the match (Turkish-insensitive), with "…" when cut.
 */
function snippet(source, q, radius = 60) {
  const src = String(source || "").replace(/\s+/g, " ").trim();
  const hay = fold(src);
  const needle = fold(q);
  let at = needle ? hay.indexOf(needle) : -1;
  if (at < 0) {
    const out = src.length > radius * 2 ? `${src.slice(0, radius * 2)}…` : src;
    return { text: out, start: -1, end: -1 };
  }
  const from = Math.max(0, at - radius);
  const to = Math.min(src.length, at + needle.length + radius);
  const head = from > 0 ? "…" : "";
  const tail = to < src.length ? "…" : "";
  const text = `${head}${src.slice(from, to)}${tail}`;
  const start = head.length + (at - from);
  return { text, start, end: start + needle.length };
}

/** Accent / case-insensitive check used after the DB ilike (Turkish İ/ı). */
function matches(text, q) {
  return fold(text).includes(fold(q));
}

module.exports = { MIN_QUERY, MAX_QUERY, cleanQuery, likePattern, searchableText, snippet, matches, fold };
