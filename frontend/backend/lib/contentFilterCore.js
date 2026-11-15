"use strict";

/**
 * Kelime filtresi engine (Moderasyon › İçerik filtreleri, Nov 2026). Pure: no
 * database, no clock. Rules are { id, pattern, kind: word | prefix | regex,
 * severity: low | medium | high, action, timeoutSeconds }. Matching runs on the
 * original text so match offsets can be highlighted as they are.
 *  - word:   a whole token, case-insensitive (Turkish İ folds to i); a pattern
 *            with spaces is a phrase of whole tokens;
 *  - prefix: a token that starts with the stem ("aptal*" hits "aptallar");
 *  - regex:  JavaScript regex (flags i + u), guarded against the shapes that
 *            backtrack badly, run on at most MAX_TEXT characters.
 * Tested by contentFilterCore.selftest.cjs.
 */

const SEVERITIES = Object.freeze(["low", "medium", "high"]);
const KINDS = Object.freeze(["word", "prefix", "regex"]);
/** Weakest to strongest. */
const ACTIONS = Object.freeze(["mask", "mask_flag", "block", "block_flag", "block_timeout"]);
const LANGUAGES = Object.freeze(["tr", "en", "de", "es", "fr", "pt-BR", "ru", "all"]);
const DEFAULT_ACTION_BY_SEVERITY = Object.freeze({ low: "mask", medium: "mask_flag", high: "block_flag" });
const DEFAULT_TIMEOUT_SECONDS = 3600;
const MAX_PATTERN = 160;
const MAX_TEXT = 4000;
const MAX_MATCHES_PER_RULE = 25;

const TOKEN_RE = /[\p{L}\p{N}]+/gu;

function normalizeWord(value) {
  return String(value || "")
    .replace(/İ/g, "i")
    .toLowerCase()
    .normalize("NFC")
    .trim();
}

/** Matching key: normalizeWord with the dotless ı folded to i, so "APTAL", "aptal" and "aptal" typed with ı all match. */
function foldWord(value) {
  return normalizeWord(value).replace(/ı/g, "i");
}

function severityRank(s) {
  const i = SEVERITIES.indexOf(s);
  return i < 0 ? 0 : i;
}

function actionRank(a) {
  const i = ACTIONS.indexOf(a);
  return i < 0 ? 0 : i;
}

function actionBlocks(action) {
  return String(action || "").startsWith("block");
}

function actionFlags(action) {
  return action === "mask_flag" || action === "block_flag" || action === "block_timeout";
}

/** Escape a literal for a RegExp source. */
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Why a regex source is refused, or null when it may be used. Refuses: empty or
 * too long, back-references, nested quantifiers ((a+)+, (\w*)*, (x+){2,}) and
 * anything that does not compile with the i and u flags.
 */
function regexProblem(source) {
  const src = String(source || "");
  if (!src.trim()) return "empty";
  if (src.length > MAX_PATTERN) return "too_long";
  if (/\\[1-9]/.test(src) || /\\k</.test(src)) return "backreference";
  if (/\((?:[^()\\]|\\.)*[*+}](?:[^()\\]|\\.)*\)\s*(?:[*+]|\{\d+,?\d*\})/.test(src)) return "nested_quantifier";
  try {
    // eslint-disable-next-line no-new
    new RegExp(src, "iu");
  } catch {
    return "invalid";
  }
  return null;
}

/**
 * Turn what an admin typed into a rule shape: "word", "word*" or "/regex/".
 * An explicit kind wins over the detected one.
 * @returns {{ pattern: string, kind: string, error: string|null }}
 */
function parseInput(raw, kindHint) {
  let text = String(raw || "").trim();
  let kind = KINDS.includes(kindHint) ? kindHint : null;
  if (!kind) {
    if (text.length > 2 && text.startsWith("/") && text.lastIndexOf("/") > 0) kind = "regex";
    else if (text.endsWith("*")) kind = "prefix";
    else kind = "word";
  }
  if (kind === "regex" && text.length > 2 && text.startsWith("/") && text.lastIndexOf("/") > 0) {
    text = text.slice(1, text.lastIndexOf("/"));
  }
  if (kind === "prefix") text = text.replace(/\*+$/, "");
  if (kind !== "regex") text = normalizeWord(text).replace(/\s+/g, " ");
  if (!text) return { pattern: "", kind, error: "empty" };
  if (text.length > MAX_PATTERN) return { pattern: text, kind, error: "too_long" };
  if (kind === "prefix" && text.length < 2) return { pattern: text, kind, error: "too_short" };
  if (kind === "regex") return { pattern: text, kind, error: regexProblem(text) };
  if (/[\p{L}\p{N}]/u.test(text) === false) return { pattern: text, kind, error: "empty" };
  return { pattern: text, kind, error: null };
}

/** Display form: "aptal*" for a prefix, the pattern otherwise. */
function displayPattern(rule) {
  if (!rule) return "";
  return rule.kind === "prefix" ? `${rule.pattern}*` : String(rule.pattern || "");
}

/**
 * Compile active rules once. Rules that fail to compile are skipped (and
 * listed in `skipped`), they never throw at send time.
 */
function compileRules(rules) {
  const words = new Map(); // folded token -> [rule]
  const prefixes = []; // { stem, rule }
  const phrases = []; // { re, rule }
  const regexes = []; // { re, rule }
  const skipped = [];
  for (const rule of rules || []) {
    if (!rule || rule.removedAt || rule.enabled === false) continue;
    const pattern = String(rule.pattern || "");
    if (!pattern) continue;
    if (rule.kind === "regex") {
      if (regexProblem(pattern)) {
        skipped.push(rule.id);
        continue;
      }
      regexes.push({ re: new RegExp(pattern, "giu"), rule });
    } else if (rule.kind === "prefix") {
      const stem = foldWord(pattern.replace(/\*+$/, ""));
      if (stem.length >= 2) prefixes.push({ stem, rule });
    } else if (/\s/.test(pattern.trim())) {
      const parts = pattern.trim().split(/\s+/).map(escapeRe);
      phrases.push({ re: new RegExp(`(?<![\\p{L}\\p{N}])${parts.join("\\s+")}(?![\\p{L}\\p{N}])`, "giu"), rule });
    } else {
      const key = foldWord(pattern);
      if (!words.has(key)) words.set(key, []);
      words.get(key).push(rule);
    }
  }
  return { words, prefixes, phrases, regexes, skipped, size: (rules || []).length };
}

function matchOf(rule, start, end, text) {
  return {
    start,
    end,
    text: text.slice(start, end),
    ruleId: rule.id || null,
    pattern: displayPattern(rule),
    kind: rule.kind,
    severity: SEVERITIES.includes(rule.severity) ? rule.severity : "medium",
    action: ACTIONS.includes(rule.action) ? rule.action : "mask",
    timeoutSeconds: rule.timeoutSeconds || null,
  };
}

/**
 * Every match in the text, sorted by position; overlapping matches of the same
 * span keep the strongest rule.
 */
function matchText(text, compiled) {
  const src = typeof text === "string" ? text.slice(0, MAX_TEXT) : "";
  if (!src || !compiled) return [];
  const out = [];
  TOKEN_RE.lastIndex = 0;
  for (const m of src.matchAll(TOKEN_RE)) {
    const token = m[0];
    const start = m.index;
    const end = start + token.length;
    const folded = foldWord(token);
    for (const rule of compiled.words.get(folded) || []) out.push(matchOf(rule, start, end, src));
    for (const { stem, rule } of compiled.prefixes) if (folded.startsWith(stem)) out.push(matchOf(rule, start, end, src));
  }
  for (const list of [compiled.phrases, compiled.regexes]) {
    for (const { re, rule } of list) {
      re.lastIndex = 0;
      let n = 0;
      let m;
      while ((m = re.exec(src)) && n < MAX_MATCHES_PER_RULE) {
        if (!m[0]) {
          re.lastIndex += 1;
          continue;
        }
        out.push(matchOf(rule, m.index, m.index + m[0].length, src));
        n += 1;
      }
    }
  }
  out.sort((a, b) => a.start - b.start || b.end - a.end || actionRank(b.action) - actionRank(a.action));
  // Same span twice (a word rule and a prefix rule): keep the strongest.
  const seen = new Map();
  const result = [];
  for (const m of out) {
    const key = `${m.start}:${m.end}`;
    const prev = seen.get(key);
    if (prev) {
      if (actionRank(m.action) > actionRank(prev.action) || severityRank(m.severity) > severityRank(prev.severity)) {
        result[result.indexOf(prev)] = m;
        seen.set(key, m);
      }
      continue;
    }
    seen.set(key, m);
    result.push(m);
  }
  return result;
}

/**
 * What happens to a message with these matches.
 * @returns {null | { block: boolean, flag: boolean, timeoutSeconds: number|null, severity: string, action: string, count: number, matches: object[] }}
 */
function verdictOf(matches) {
  if (!Array.isArray(matches) || !matches.length) return null;
  let action = "mask";
  let severity = "low";
  let timeoutSeconds = null;
  for (const m of matches) {
    if (actionRank(m.action) > actionRank(action)) action = m.action;
    if (severityRank(m.severity) > severityRank(severity)) severity = m.severity;
    if (m.action === "block_timeout") {
      timeoutSeconds = Math.max(timeoutSeconds || 0, Number(m.timeoutSeconds) || DEFAULT_TIMEOUT_SECONDS);
    }
  }
  return {
    block: actionBlocks(action),
    flag: matches.some((m) => actionFlags(m.action)),
    timeoutSeconds,
    severity,
    action,
    count: matches.length,
    matches,
  };
}

/** Kind of the strongest match, for the queue chip ("Filtre · Yüksek" / "Regex · …"). */
function ruleKindOf(matches) {
  if (!Array.isArray(matches) || !matches.length) return null;
  let best = matches[0];
  for (const m of matches) if (actionRank(m.action) > actionRank(best.action) || severityRank(m.severity) > severityRank(best.severity)) best = m;
  return best.kind;
}

/**
 * Language of a built-in word: the bundled list puts its English words first
 * and its Turkish words after "siktir*".
 */
function defaultWordLanguages(words) {
  const list = Array.isArray(words) ? words : [];
  const firstTr = list.findIndex((w) => /^sik/.test(String(w)));
  return list.map((w, i) => ({ word: w, language: firstTr >= 0 && i >= firstTr ? "tr" : "en" }));
}

/** "aptal*" → { pattern: "aptal", kind: "prefix" }, "salak" → word. */
function wordToRule(word) {
  const w = normalizeWord(word);
  if (w.endsWith("*")) return { pattern: w.replace(/\*+$/, ""), kind: "prefix" };
  return { pattern: w, kind: "word" };
}

module.exports = {
  SEVERITIES,
  KINDS,
  ACTIONS,
  LANGUAGES,
  DEFAULT_ACTION_BY_SEVERITY,
  DEFAULT_TIMEOUT_SECONDS,
  MAX_PATTERN,
  MAX_TEXT,
  normalizeWord,
  foldWord,
  severityRank,
  actionRank,
  actionBlocks,
  actionFlags,
  regexProblem,
  parseInput,
  displayPattern,
  compileRules,
  matchText,
  verdictOf,
  ruleKindOf,
  defaultWordLanguages,
  wordToRule,
};
