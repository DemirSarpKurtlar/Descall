// Uyarlanan kart (growth 1B) client helpers: suggested password (passphrase.js + word
// lists), on-device breach check (breach.js), email chips / typo fix / username ideas /
// readiness (identity.js), the half-finished sign-up store (cardDraft.js).
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { WORDLISTS } from "./wordlists.js";
import { makePassphrase, suggestPassphrase, secureIndex, passphraseEntropy, wordlistLocale, PASSPHRASE_WORDS } from "./passphrase.js";
import { sha1Hex, sha1Fallback, countInRange, checkPasswordBreach, __clearBreachCache } from "./breach.js";
import { domainChips, withDomain, emailTypoFix, identifierKind, loginName, ideasFromEmail, readiness, isEmail } from "./identity.js";
import { loadCardDraft, saveCardDraft, clearCardDraft } from "./cardDraft.js";
import { usernameIssue } from "../signupRules.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

// ---- word lists ----
const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];
for (const id of LOCALES) {
  const list = WORDLISTS[id];
  assert.ok(Array.isArray(list), `${id}: list`);
  assert.equal(new Set(list).size, list.length, `${id}: no duplicates`);
  assert.ok(list.length >= 512, `${id}: at least 512 words (${list.length})`);
  for (const w of list) assert.match(w, /^[a-z]{3,10}$/, `${id}: ascii word ${w}`);
  const bits = passphraseEntropy(list.length, PASSPHRASE_WORDS);
  assert.ok(bits >= 42, `${id}: ${bits.toFixed(1)} bits`);
}
assert.equal(wordlistLocale("pt-BR"), "pt-BR");
assert.equal(wordlistLocale("pt"), "pt-BR");
assert.equal(wordlistLocale("tr-TR"), "tr");
assert.equal(wordlistLocale("ja"), "en");

// ---- secure index: in range, every value reachable, rejection keeps it uniform ----
{
  const counts = new Array(7).fill(0);
  for (let i = 0; i < 7000; i += 1) counts[secureIndex(7)] += 1;
  assert.ok(counts.every((c) => c > 800 && c < 1200), `uniform-ish ${counts}`);
  // A source that first returns values in the biased tail is re-drawn.
  const seq = [0xffffffff, 0xfffffffe, 5];
  let i = 0;
  assert.equal(secureIndex(10, () => [seq[i++]]), 5);
  assert.throws(() => secureIndex(0));
  assert.throws(() => secureIndex(10, () => [0xffffffff]), /broken/);
}

// ---- passphrase ----
{
  const p = makePassphrase(WORDLISTS.tr);
  assert.match(p.value, /^([A-Z][a-z]{2,9}-){4}\d{2}$/, p.value);
  assert.equal(new Set(p.words).size, 4, "no word twice");
  assert.ok(p.number >= 10 && p.number <= 99);
  assert.ok(p.value.length <= 72);
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) seen.add(makePassphrase(WORDLISTS.en).value);
  assert.equal(seen.size, 200, "no repeats in 200 draws");
  assert.throws(() => makePassphrase(["a", "b"]), /too small/);
  // Breached draws are skipped; all breached -> none offered.
  let calls = 0;
  const s = await suggestPassphrase({ locale: "tr", lists: WORDLISTS, isBreached: async () => (++calls === 1 ? true : false) });
  assert.ok(s && s.checked === true && calls === 2, "first breached draw skipped");
  assert.equal(await suggestPassphrase({ locale: "de", lists: WORDLISTS, isBreached: async () => true }), null);
  const offline = await suggestPassphrase({ locale: "ru", lists: WORDLISTS, isBreached: async () => null });
  assert.ok(offline && offline.checked === false, "list unreachable: still offered, marked unchecked");
  const broken = await suggestPassphrase({ locale: "fr", lists: WORDLISTS, isBreached: async () => { throw new Error("x"); } });
  assert.ok(broken, "a failing check does not block the suggestion");
}

// ---- breach ----
{
  for (const v of ["", "a", "galatasaray1905", "Vapur-Simit-Kanat-Lodos-47", "şifre güçlü ünlü", "x".repeat(200)]) {
    const want = createHash("sha1").update(v, "utf8").digest("hex").toUpperCase();
    assert.equal(sha1Fallback(v), want, `fallback sha1 of ${JSON.stringify(v).slice(0, 20)}`);
    assert.equal(await sha1Hex(v), want);
  }
  const hash = createHash("sha1").update("galatasaray1905").digest("hex").toUpperCase();
  const body = `${"A".repeat(35)}:2\n${hash.slice(5)}:48312\n`;
  assert.equal(countInRange(body, hash), 48312);
  assert.equal(countInRange(body, "0".repeat(40)), 0);
  __clearBreachCache();
  const asked = [];
  const fetchRange = async (prefix) => {
    asked.push(prefix);
    return body;
  };
  let r = await checkPasswordBreach("galatasaray1905", { fetchRange });
  assert.deepEqual(r, { status: "breached", count: 48312 });
  assert.deepEqual(asked, [hash.slice(0, 5)], "only the 5-character prefix is sent");
  assert.ok(!asked.some((x) => x.includes("galatasaray")), "never the password");
  r = await checkPasswordBreach("galatasaray1905", { fetchRange });
  assert.equal(asked.length, 1, "range cached");
  const other = createHash("sha1").update("Kayik-Bulut-Defne-Lodos-28").digest("hex").toUpperCase();
  r = await checkPasswordBreach("Kayik-Bulut-Defne-Lodos-28", { fetchRange: async () => `${other.slice(5, 39)}0:4` });
  assert.equal(r.status, "clean");
  r = await checkPasswordBreach("anything-at-all", { fetchRange: async () => { throw new Error("offline"); } });
  assert.equal(r.status, "unknown");
  r = await checkPasswordBreach("", { fetchRange });
  assert.equal(r.status, "unknown");
}

// ---- identity ----
assert.deepEqual(domainChips("demir.kaya@g", "tr"), ["gmail.com"]);
assert.deepEqual(domainChips("demir.kaya@", "tr"), ["gmail.com", "hotmail.com", "outlook.com"]);
assert.deepEqual(domainChips("demir.kaya@gmail.com", "tr"), []);
assert.deepEqual(domainChips("demir", "tr"), []);
assert.deepEqual(domainChips("ivan@", "ru"), ["mail.ru", "yandex.ru", "gmail.com"]);
assert.deepEqual(domainChips("a@@g", "en"), []);
assert.equal(withDomain("demir.kaya@g", "gmail.com"), "demir.kaya@gmail.com");
assert.equal(emailTypoFix("Demir@gmial.com"), "demir@gmail.com");
assert.equal(emailTypoFix("demir@hotmail.con"), "demir@hotmail.com");
assert.equal(emailTypoFix("demir@gmail.com"), null);
assert.equal(identifierKind(""), "empty");
assert.equal(identifierKind("demir@gmail"), "partial");
assert.equal(identifierKind("demir@gmail.com"), "email");
assert.equal(identifierKind("demirkaya"), "username");
assert.equal(identifierKind("bad name!"), "invalid");
// Not an email -> a username lookup; reserved and older names still count (they sign in).
assert.equal(identifierKind("admin"), "username");
assert.equal(identifierKind("@demirkaya"), "username");
assert.equal(identifierKind("a"), "invalid");
assert.equal(identifierKind("abc@"), "partial", "has @ but is not an address: the email error");
assert.equal(identifierKind("@"), "partial");
assert.equal(identifierKind("@demir@x"), "partial");
assert.equal(loginName("  @Demirkaya "), "Demirkaya");
assert.equal(loginName("demir kaya"), null);
assert.equal(loginName("x".repeat(33)), null);
assert.equal(isEmail(" ece@outlook.com "), true);
{
  const ideas = ideasFromEmail("demir.kaya@gmail.com", { digits: "07" });
  assert.deepEqual(ideas.slice(0, 4), ["demirkaya", "demir.k", "dkaya", "demirk07"], ideas.join(","));
  for (const i of ideas) assert.equal(usernameIssue(i), null, i);
  assert.ok(ideasFromEmail("şükrü.öztürk@x.com").includes("sukruozturk"));
  assert.ok(ideasFromEmail("ece@outlook.com", { year: "2006" }).includes("ece06"));
  assert.deepEqual(ideasFromEmail("@x.com"), []);
  assert.ok(ideasFromEmail("a+promo@x.com").every((i) => !i.includes("promo")), "plus tag dropped");
  assert.ok(!ideasFromEmail("admin@x.com").includes("admin"), "reserved names skipped");
}
assert.equal(readiness({ step: "start" }), 4);
assert.equal(readiness({ step: "start", identifier: "d" }), 8);
assert.equal(readiness({ step: "register", usernameOk: true, passwordOk: true, birthOk: true, termsOk: true }), 100);
assert.equal(readiness({ step: "register", usernameOk: true, passwordTyped: true }), 50);
assert.equal(readiness({ step: "login", passwordFilled: true }), 80);

// ---- half-finished sign-up ----
{
  const mem = new Map();
  const s = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  saveCardDraft({ identifier: "ece@outlook.com" }, 1000, s);
  saveCardDraft({ username: "ece" }, 2000, s);
  assert.deepEqual(loadCardDraft(3000, s), { identifier: "ece@outlook.com", username: "ece" });
  assert.ok(!/password/i.test([...mem.values()].join("")), "never a password");
  assert.equal(loadCardDraft(2000 + 25 * 3600 * 1000, s), null, "expires after a day");
  saveCardDraft({ identifier: "x@y.co" }, 1, s);
  clearCardDraft(s);
  assert.equal(loadCardDraft(2, s), null);
  mem.set("descall:signupCard:v1", "{broken");
  assert.equal(loadCardDraft(3, s), null);
}

console.log("adaptiveSignup.selftest: ok");
