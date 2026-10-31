/**
 * UI languages for server-side text (emails, push, stored preferences). The list is
 * the app's own src/i18n/locales.json, so the backend can never drift from the client.
 *
 * Server text picks a language with resolveLang(): the first candidate (explicit user
 * choice, device locale, Accept-Language ...) that is a live locale AND has a template
 * in `available`. Draft languages are never used for real users.
 */
const data = require("../../src/i18n/locales.json");

const FALLBACK = data.fallback;
const LOCALES = Object.freeze(data.locales.map((l) => Object.freeze({ ...l })));
const BY_ID = new Map(LOCALES.map((l) => [l.id, l]));

/** Registered id for any language value ("pt_BR", "de-AT", "TR"), or null. */
function normalizeLocale(value, { liveOnly = false } = {}) {
  const raw = String(value || "").trim().replace(/_/g, "-");
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const ok = (meta) => meta && (!liveOnly || meta.status === "live");
  for (const meta of LOCALES) {
    if (meta.id.toLowerCase() === lower) return ok(meta) ? meta.id : null;
  }
  const base = lower.split("-")[0];
  if (!/^[a-z]{2,3}$/.test(base)) return null;
  for (const meta of LOCALES) {
    if (meta.id.toLowerCase().split("-")[0] === base && ok(meta)) return meta.id;
  }
  return null;
}

/** "tr-TR,tr;q=0.9,en;q=0.8" -> ["tr-TR", "tr", "en"] ordered by q. */
function parseAcceptLanguage(header) {
  return String(header || "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((x) => x.tag && x.tag !== "*" && x.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((x) => x.tag);
}

/**
 * First candidate that is a live locale with a template in `available`, else
 * `fallback` (which must itself be in `available`). Candidates may be arrays.
 */
function resolveLang(candidates, { available, fallback = FALLBACK } = {}) {
  const have = new Set(available || LOCALES.map((l) => l.id));
  const flat = [];
  for (const c of candidates || []) {
    if (Array.isArray(c)) flat.push(...c);
    else flat.push(c);
  }
  for (const c of flat) {
    const id = normalizeLocale(c, { liveOnly: true });
    if (id && have.has(id)) return id;
  }
  return fallback;
}

function intlTag(id) {
  return (BY_ID.get(id) || BY_ID.get(FALLBACK)).intl;
}

function liveLocaleIds() {
  return LOCALES.filter((l) => l.status === "live").map((l) => l.id);
}

module.exports = {
  FALLBACK,
  LOCALES,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLang,
  intlTag,
  liveLocaleIds,
};
