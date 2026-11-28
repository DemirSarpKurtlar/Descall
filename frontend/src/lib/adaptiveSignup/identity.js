/**
 * Pure helpers of the sign-up card's first step (growth 1B): the email field's one-tap
 * domain chips and typo fix, username ideas made from the email, and the readiness line.
 * No React, no network: identity.selftest.mjs.
 */
import { usernameIssue } from "../signupRules.js";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Popular mail domains per language, most used first (one-tap completion chips). */
const DOMAINS = {
  tr: ["gmail.com", "hotmail.com", "outlook.com", "icloud.com", "yahoo.com", "yandex.com"],
  en: ["gmail.com", "outlook.com", "icloud.com", "yahoo.com", "hotmail.com", "proton.me"],
  de: ["gmail.com", "web.de", "gmx.de", "outlook.de", "t-online.de", "icloud.com"],
  es: ["gmail.com", "hotmail.com", "outlook.es", "yahoo.es", "icloud.com", "outlook.com"],
  fr: ["gmail.com", "orange.fr", "hotmail.fr", "outlook.fr", "free.fr", "icloud.com"],
  "pt-BR": ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com.br", "icloud.com", "bol.com.br"],
  ru: ["mail.ru", "yandex.ru", "gmail.com", "bk.ru", "inbox.ru", "list.ru"],
};

/** Common misspellings -> the domain meant ("gmial.com" -> "gmail.com"). */
const TYPOS = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com",
  "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gmail.om": "gmail.com", "gmaill.com": "gmail.com",
  "gmail.com.tr": "gmail.com", "gmailcom": "gmail.com", "gmeil.com": "gmail.com", "gimail.com": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com", "hotmil.com": "hotmail.com", "hotamil.com": "hotmail.com", "homail.com": "hotmail.com",
  "outlok.com": "outlook.com", "outllok.com": "outlook.com", "outlook.co": "outlook.com", "outlook.con": "outlook.com", "otlook.com": "outlook.com",
  "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.co": "yahoo.com", "yahoo.con": "yahoo.com",
  "icloud.co": "icloud.com", "iclod.com": "icloud.com", "icoud.com": "icloud.com", "icloud.con": "icloud.com",
  "yandex.con": "yandex.com", "yandx.com": "yandex.com", "mail.ry": "mail.ru", "mial.ru": "mail.ru",
};

export function domainsFor(locale) {
  const v = String(locale || "");
  if (/^pt/i.test(v)) return DOMAINS["pt-BR"];
  return DOMAINS[v.slice(0, 2).toLowerCase()] || DOMAINS.en;
}

/**
 * Chips under the email field while the domain is being typed: "demir.kaya@g" ->
 * ["gmail.com"]; "demir.kaya@" -> the first three. None once the address is complete.
 */
export function domainChips(value, locale, max = 3) {
  const v = String(value || "").trim();
  const at = v.indexOf("@");
  if (at < 1 || v.indexOf("@", at + 1) !== -1) return [];
  const typed = v.slice(at + 1).toLowerCase();
  const list = domainsFor(locale);
  if (list.includes(typed)) return [];
  return list.filter((d) => d.startsWith(typed) && d !== typed).slice(0, max);
}

/** The address with a chip's domain: ("demir.kaya@g", "gmail.com") -> "demir.kaya@gmail.com". */
export function withDomain(value, domain) {
  const v = String(value || "").trim();
  const at = v.indexOf("@");
  const local = at === -1 ? v : v.slice(0, at);
  return `${local}@${domain}`;
}

/** "demir@gmial.com" -> "demir@gmail.com", or null when the domain looks right. */
export function emailTypoFix(value) {
  const v = String(value || "").trim().toLowerCase();
  const at = v.lastIndexOf("@");
  if (at < 1) return null;
  const fixed = TYPOS[v.slice(at + 1)];
  return fixed ? `${v.slice(0, at)}@${fixed}` : null;
}

export function isEmail(value) {
  const v = String(value || "").trim();
  return v.length <= 254 && EMAIL_RE.test(v);
}

/**
 * The username in the first field ("@demirkaya" -> "demirkaya"), or null. Only the shape
 * (2..32 characters, no spaces, no "@" inside), the same as the server's identify
 * (lib/adaptiveSignup.js cleanLoginName): reserved names ("admin") and names from before
 * today's sign-up rules still sign in.
 */
export function loginName(value) {
  const v = String(value || "").trim().replace(/^@/, "");
  if (v.length < 2 || v.length > 32 || /[\s@]/.test(v)) return null;
  return v;
}

/**
 * The first step accepts an email or a username (existing accounts sign in by name).
 * email | username | partial (has "@" but is not an address yet: the email error) |
 * invalid (cannot be anyone's username) | empty.
 */
export function identifierKind(value) {
  const v = String(value || "").trim();
  if (!v) return "empty";
  const atName = v.length > 1 && v.startsWith("@") && !v.includes("@", 1);
  if (v.includes("@") && !atName) return isEmail(v) ? "email" : "partial";
  return loginName(v) ? "username" : "invalid";
}

const TR_FOLD = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
function foldName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[çğıİöşüâîû]/g, (c) => TR_FOLD[c] || c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

/**
 * Username ideas from the email's local part, best first ("demir.kaya@gmail.com" ->
 * demirkaya, demir.k, dkaya, demirk07 ...). Only names the username rules accept; the
 * server says which are free (POST /auth/username/ideas). `year` (birth year) or `digits`
 * (two random digits the card picks once) makes the numbered variant.
 */
export function ideasFromEmail(email, { year = null, digits = "07", max = 8 } = {}) {
  // "ece+promo@x.com": the tag after + is not part of the name.
  const local = (String(email || "").split("@")[0] || "").replace(/\+.*$/, "");
  const parts = local.split(/[._-]+/).map(foldName).filter(Boolean);
  const raw = foldName(local).replace(/[._-]+/g, "");
  const out = [];
  const add = (v) => {
    const s = String(v || "").replace(/^[._-]+|[._-]+$/g, "").slice(0, 24);
    if (s.length >= 3 && !usernameIssue(s) && !out.includes(s)) out.push(s);
  };
  const yy = year && /^\d{4}$/.test(String(year)) ? String(year).slice(2) : /^\d{2}$/.test(String(digits)) ? String(digits) : null;
  const [first, second] = parts;
  if (first && second) {
    add(`${first}${second}`);
    add(`${first}.${second[0]}`);
    add(`${first[0]}${second}`);
    if (yy) add(`${first}${second[0]}${yy}`);
    add(`${first}_${second}`);
    add(`${first}.${second}`);
  } else if (raw) {
    add(raw);
    if (yy) add(`${raw}${yy}`);
    add(`${raw}_`);
    add(`${raw}.tr`);
  }
  if (raw) add(raw);
  if (first) add(first);
  return out.slice(0, max);
}

/**
 * The thin line on the card's top edge: how close this card is to done (0..100).
 * start: something typed in the first step. register / login: the fields the card asks for.
 */
export function readiness(card) {
  const c = card || {};
  if (c.step === "start") {
    if (c.identifierOk) return 30;
    return c.identifier ? 8 : 4;
  }
  if (c.step === "login" || c.step === "reset") {
    let n = 40;
    if (c.passwordFilled) n += 40;
    if (c.codeFilled) n += 20;
    return Math.min(100, n);
  }
  if (c.step === "register") {
    let n = 20; // the email is known and free
    if (c.usernameOk) n += 20;
    if (c.passwordOk) n += 30;
    else if (c.passwordTyped) n += 10;
    if (c.birthOk) n += 15;
    if (c.termsOk) n += 15;
    return Math.min(100, n);
  }
  return 0;
}
