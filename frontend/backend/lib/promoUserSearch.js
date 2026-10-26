"use strict";

/**
 * Admin promo "Seçilenler" people search. The database function
 * public.promo_admin_user_search (supabase/migrations/20261027_promo_user_search.sql)
 * does the ranking; this file is its JS twin with the same tiers, used for
 * query cleanup, for the response shape, and as a fallback while the function
 * is not deployed yet. Only id / username / display_name / avatar_url ever
 * leave the server.
 */

const LIMIT = 8;
const MAX_LIMIT = 20;
const MAX_EXCLUDE = 100;
const MAX_Q = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FROM = "İIıŞşĞğÜüÖöÇçÂâÎîÛû";
const TO = "iiissgguuooccaaiiuu";
const MAP = new Map([...FROM].map((ch, i) => [ch, TO[i]]));

/** Turkish-aware, case-insensitive key. Same as public.promo_fold. */
function fold(s) {
  let out = "";
  for (const ch of String(s ?? "")) out += MAP.get(ch) ?? ch;
  return out.toLowerCase();
}

/** Raw query → what the user meant: no leading @, single spaces, ≤ 32 chars. */
function cleanQuery(raw) {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/^\s*@+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_Q);
}

function cleanExclude(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  const out = [];
  for (const id of list) {
    const v = String(id).trim();
    if (UUID.test(v) && !out.includes(v)) out.push(v.toLowerCase());
    if (out.length >= MAX_EXCLUDE) break;
  }
  return out;
}

function clampLimit(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, n));
}

const words = (s) => " " + s.replace(/[._-]/g, " ");

function inOrderFromWordStart(hay, letters) {
  // letters must appear in order, the first one at the start of a word
  for (let i = 0; i < hay.length; i += 1) {
    if (hay[i] !== letters[0] || (i > 0 && hay[i - 1] !== " ")) continue;
    let j = 1;
    for (let k = i + 1; k < hay.length && j < letters.length; k += 1) if (hay[k] === letters[j]) j += 1;
    if (j === letters.length) return true;
  }
  return false;
}

/**
 * 0 exact, 1 username prefix, 2 name prefix, 3 word prefix, 4 username
 * contains, 5 name contains, 6 letters in order from a word start (3+),
 * null = no match. `q` must already be folded.
 */
function rankUser(user, q) {
  if (!q) return null;
  const u = fold(user?.username);
  const d = fold(user?.display_name);
  const z = q.replace(/ /g, "");
  if (u === q || d === q) return 0;
  if (u.startsWith(q)) return 1;
  if (d.startsWith(q)) return 2;
  if (words(d).includes(" " + q) || words(u).includes(" " + q)) return 3;
  if (q.length >= 2 && u.includes(q)) return 4;
  if (q.length >= 2 && d.includes(q)) return 5;
  if (z.length >= 3 && (inOrderFromWordStart(words(u), z) || inOrderFromWordStart(words(d), z)))
    return 6;
  return null;
}

/** Same as the SQL function: rank, then shorter username, then alphabetical. */
function rankUsers(users, rawQ, { exclude = [], limit = LIMIT } = {}) {
  const q = fold(cleanQuery(rawQ));
  if (!q) return [];
  const skip = new Set(exclude.map((x) => String(x).toLowerCase()));
  return (users || [])
    .filter((x) => x && !x.deleted_at && !x.is_banned && !skip.has(String(x.id).toLowerCase()))
    .map((x) => ({ x, rank: rankUser(x, q) }))
    .filter((r) => r.rank !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        String(a.x.username).length - String(b.x.username).length ||
        (String(a.x.username) < String(b.x.username) ? -1 : String(a.x.username) > String(b.x.username) ? 1 : 0)
    )
    .slice(0, clampLimit(limit))
    .map((r) => publicUser(r.x));
}

/** Allow-list: nothing else (email, phone, IP, sessions, balance…) is ever sent. */
function publicUser(x) {
  return {
    id: x.id,
    username: x.username,
    display_name: x.display_name || null,
    avatar_url: x.avatar_url || null,
  };
}

module.exports = { fold, cleanQuery, cleanExclude, clampLimit, rankUser, rankUsers, publicUser, LIMIT, MAX_EXCLUDE };
