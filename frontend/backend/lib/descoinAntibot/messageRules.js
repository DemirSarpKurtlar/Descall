"use strict";

/**
 * Pure message-earning rules (plan §3). No I/O; the store passes state in.
 * Faz 0: the verdict is only recorded as a "would not earn" shadow counter;
 * the message still earns exactly as before.
 */

const MIN_CHARS = 8;
const MIN_WORDS = 2;
const SIMILARITY_MAX = 0.8;
const HISTORY = 20;
const REPLY_WINDOW_MS = 10 * 60_000;
const MINHASH_K = 24;

const TR_MAP = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

function stripNoise(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/<a?:\w+:\d+>/g, " ") // custom emoji tokens
    .replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(text) {
  return stripNoise(text)
    .toLocaleLowerCase("tr")
    .replace(/[çğıİöşüâîû]/g, (c) => TR_MAP[c] || c)
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/(.)\1{2,}/g, "$1$1") // "heyyyyy" → "heyy"
    .replace(/\s+/g, " ")
    .trim();
}

function lengthOk(text) {
  const clean = stripNoise(text);
  const words = clean.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w));
  return clean.replace(/\s/g, "").length >= MIN_CHARS && words.length >= MIN_WORDS;
}

function fnv1a(str, seed) {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h | 0; // signed int4 fits Postgres integer[]
}

function shingles(norm) {
  const s = norm.replace(/\s/g, "_");
  if (s.length < 3) return [s];
  const out = new Set();
  for (let i = 0; i <= s.length - 3; i += 1) out.add(s.slice(i, i + 3));
  return [...out];
}

/** MinHash signature: Jaccard estimate = share of equal slots. */
function minhash(norm, salt = 0) {
  const sh = shingles(norm);
  const sig = new Array(MINHASH_K);
  for (let k = 0; k < MINHASH_K; k += 1) {
    let min = Infinity;
    for (const g of sh) {
      const v = fnv1a(g, (Math.imul(k + 1, 0x9e3779b1) ^ salt) >>> 0);
      if (v < min) min = v;
    }
    sig[k] = min === Infinity ? 0 : min;
  }
  return sig;
}

function similarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] === b[i]) same += 1;
  return same / a.length;
}

/**
 * @param {object} p
 * @param {string} p.text
 * @param {string} p.userId
 * @param {string|null} p.dmPeerId                 DM partner (null in groups/servers)
 * @param {number[][]} p.history                   my recent minhash signatures
 * @param {Array<{userId:string,at:number}>} p.convLog  recent authors in this conversation (oldest first, may include me)
 * @param {number} p.lastCreditedHereAt            my last credited message in this conversation (0 = none)
 * @param {(id:string)=>boolean} p.isRealOther     other author is a real, unlinked, eligible human
 * @param {Map<string,number>} p.counterpartCreditsToday credited messages per counterpart today
 * @param {number} p.dayCap
 * @param {number} p.now
 * @param {number} [p.salt]                        keyed MinHash salt
 * @returns {{ok:boolean, reason:string|null, counterpartId:string|null, signature:number[]}}
 */
function evaluateMessage(p) {
  const now = p.now ?? Date.now();
  const norm = normalize(p.text);
  const signature = minhash(norm, p.salt || 0);
  const fail = (reason, counterpartId = null) => ({ ok: false, reason, counterpartId, signature });

  if (p.dmPeerId && p.dmPeerId === p.userId) return fail("self_dm");
  if (!lengthOk(p.text)) return fail("too_short");
  for (const prev of (p.history || []).slice(-HISTORY)) {
    if (similarity(prev, signature) >= SIMILARITY_MAX) return fail("similar");
  }

  // Real reply: newest message by someone else within 10 min, written after my
  // last credited message here (alternation: one credit per turn).
  let counterpartId = null;
  let otherAt = 0;
  const log = p.convLog || [];
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const e = log[i];
    if (now - e.at > REPLY_WINDOW_MS) break;
    if (e.userId === p.userId) continue;
    if (p.dmPeerId && e.userId !== p.dmPeerId) continue;
    if (!p.isRealOther(e.userId)) continue;
    counterpartId = e.userId;
    otherAt = e.at;
    break;
  }
  if (!counterpartId) return fail("no_reply");
  if ((p.lastCreditedHereAt || 0) >= otherAt) return fail("same_turn", counterpartId);

  const counts = p.counterpartCreditsToday || new Map();
  const distinct = new Set(counts.keys());
  distinct.add(counterpartId);
  const fromThis = counts.get(counterpartId) || 0;
  if (distinct.size < 2 && fromThis + 1 > Math.floor((p.dayCap || 0) * 0.5)) {
    return fail("one_partner_limit", counterpartId);
  }
  return { ok: true, reason: null, counterpartId, signature };
}

module.exports = {
  normalize,
  lengthOk,
  minhash,
  similarity,
  evaluateMessage,
  MIN_CHARS,
  MIN_WORDS,
  SIMILARITY_MAX,
  HISTORY,
  REPLY_WINDOW_MS,
};
