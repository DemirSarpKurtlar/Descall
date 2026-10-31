/**
 * Message formatting for catalog strings.
 *
 *   {name} / {{name}}                       simple value
 *   {count, plural, one {# file} other {# files}}
 *                                           plural by Intl.PluralRules of the locale
 *                                           (zero/one/two/few/many/other and exact =N);
 *                                           "#" is the number formatted for the locale
 *   {kind, select, voice {...} other {...}} select by value
 *
 * Unknown or malformed braces are left as written, so plain text never breaks.
 */

const pluralCache = new Map();
const numberCache = new Map();

function pluralRules(tag, type) {
  const key = `${tag}|${type}`;
  let pr = pluralCache.get(key);
  if (!pr) {
    try {
      pr = new Intl.PluralRules(tag, { type });
    } catch {
      pr = new Intl.PluralRules("en", { type });
    }
    pluralCache.set(key, pr);
  }
  return pr;
}

function formatNumber(tag, n) {
  let nf = numberCache.get(tag);
  if (!nf) {
    try {
      nf = new Intl.NumberFormat(tag);
    } catch {
      nf = new Intl.NumberFormat("en");
    }
    numberCache.set(tag, nf);
  }
  return nf.format(n);
}

/** Index of the "}" matching the "{" at `open`, or -1. */
function matchBrace(str, open) {
  let depth = 0;
  for (let i = open; i < str.length; i += 1) {
    const c = str[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** "one {a} other {b}" -> [["one","a"],["other","b"]] or null when malformed. */
function parseOptions(body) {
  const out = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i += 1;
    if (i >= body.length) break;
    const sel = /^(=\d+|[\w-]+)/.exec(body.slice(i));
    if (!sel) return null;
    i += sel[0].length;
    while (i < body.length && /\s/.test(body[i])) i += 1;
    if (body[i] !== "{") return null;
    const end = matchBrace(body, i);
    if (end < 0) return null;
    out.push([sel[0], body.slice(i + 1, end)]);
    i = end + 1;
  }
  return out.length ? out : null;
}

const COMPLEX = /^\s*(\w+)\s*,\s*(plural|selectordinal|select)\s*,([\s\S]*)$/;

function formatInner(str, vars, tag, hashValue) {
  if (typeof str !== "string" || str.indexOf("{") === -1) {
    return hashValue == null ? str : String(str).replace(/#/g, hashValue);
  }
  let out = "";
  let i = 0;
  while (i < str.length) {
    const c = str[i];
    if (c === "#" && hashValue != null) {
      out += hashValue;
      i += 1;
      continue;
    }
    if (c !== "{") {
      out += c;
      i += 1;
      continue;
    }
    // {{name}}
    const dbl = /^\{\{(\w+)\}\}/.exec(str.slice(i));
    if (dbl) {
      const v = vars ? vars[dbl[1]] : undefined;
      out += v != null ? String(v) : "";
      i += dbl[0].length;
      continue;
    }
    const end = matchBrace(str, i);
    if (end < 0) {
      out += str.slice(i);
      break;
    }
    const inner = str.slice(i + 1, end);
    const simple = /^\s*(\w+)\s*$/.exec(inner);
    if (simple) {
      const v = vars ? vars[simple[1]] : undefined;
      out += v != null ? String(v) : "";
      i = end + 1;
      continue;
    }
    const cx = COMPLEX.exec(inner);
    const options = cx ? parseOptions(cx[3]) : null;
    if (!cx || !options) {
      out += str.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    const [, name, kind] = cx;
    const raw = vars ? vars[name] : undefined;
    const map = new Map(options);
    let chosen;
    if (kind === "select") {
      chosen = map.get(String(raw)) ?? map.get("other");
      out += chosen != null ? formatInner(chosen, vars, tag, null) : "";
    } else {
      const n = Number(raw);
      const num = Number.isFinite(n) ? n : 0;
      chosen = map.get(`=${num}`);
      if (chosen == null) {
        const cat = pluralRules(tag, kind === "selectordinal" ? "ordinal" : "cardinal").select(num);
        chosen = map.get(cat) ?? map.get("other");
      }
      out += chosen != null ? formatInner(chosen, vars, tag, formatNumber(tag, num)) : "";
    }
    i = end + 1;
  }
  return out;
}

export function formatMessage(str, vars, tag = "en") {
  if (typeof str !== "string") return str;
  if (str.indexOf("{") === -1) return str;
  return formatInner(str, vars || {}, tag, null);
}

/** Names of every argument a message uses (for placeholder parity checks). */
export function messageArguments(str, names = new Set()) {
  if (typeof str !== "string") return names;
  let i = 0;
  while (i < str.length) {
    if (str[i] !== "{") {
      i += 1;
      continue;
    }
    const dbl = /^\{\{(\w+)\}\}/.exec(str.slice(i));
    if (dbl) {
      names.add(dbl[1]);
      i += dbl[0].length;
      continue;
    }
    const end = matchBrace(str, i);
    if (end < 0) break;
    const inner = str.slice(i + 1, end);
    const simple = /^\s*(\w+)\s*$/.exec(inner);
    if (simple) names.add(simple[1]);
    const cx = COMPLEX.exec(inner);
    const options = cx ? parseOptions(cx[3]) : null;
    if (cx && options) {
      names.add(cx[1]);
      for (const [, body] of options) messageArguments(body, names);
    }
    i = end + 1;
  }
  return names;
}

/** True when every {...} block in the message is well formed. */
export function isWellFormedMessage(str) {
  if (typeof str !== "string") return true;
  let depth = 0;
  for (const c of str) {
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  if (depth !== 0) return false;
  let ok = true;
  str.replace(/\{([^{}]*\{[\s\S]*)\}/g, (whole) => {
    const inner = whole.slice(1, -1);
    const cx = COMPLEX.exec(inner);
    if (cx && !parseOptions(cx[3])) ok = false;
    if (cx && cx[2] !== "select" && !/(^|\s)other\s*\{/.test(cx[3])) ok = false;
    return whole;
  });
  return ok;
}
