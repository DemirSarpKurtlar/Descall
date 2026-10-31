"use strict";
// node backend/i18n/backendI18n.selftest.cjs
// Server-side catalogs (backend/i18n/<locale>.js), the bot.* fallback, the API phrase
// catalog (src/i18n/locales/api.tr.js) and the helpers that use them.
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

const registry = require("../../src/i18n/locales.json");
const { messageArguments, isWellFormedMessage, formatMessage } = require("../lib/messageFormat");
const i18n = require("../lib/i18n");
const { apiError, apiText, templatedError, errorFields } = require("../lib/apiError");
const botText = require("../lib/botText");

const CASE_VARIANT = /(?:Nom|Gen|Dat|Acc|Loc|Abl|Ins|Poss)$/;

function leaves(obj, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else if (v && typeof v === "object") leaves(v, key, out);
  }
  return out;
}

/** Same keys, same {placeholders} (Turkish case variants of an English argument allowed). */
function compareCatalog(label, en, other, { partial = false } = {}) {
  const want = leaves(en);
  const got = leaves(other);
  const problems = [];
  for (const k of want.keys()) if (!got.has(k) && !partial) problems.push(`missing ${k}`);
  for (const [k, v] of got) {
    if (!want.has(k)) {
      problems.push(`extra ${k}`);
      continue;
    }
    if (!isWellFormedMessage(v)) problems.push(`malformed ${k}`);
    const a = messageArguments(want.get(k));
    const b = messageArguments(v);
    const extra = [...b].filter((x) => !a.has(x) && !(CASE_VARIANT.test(x) && a.has(x.replace(CASE_VARIANT, ""))));
    const lost = [...a].filter((x) => !b.has(x) && ![...b].some((y) => y.replace(CASE_VARIANT, "") === x));
    if (extra.length) problems.push(`${k}: unknown {${extra.join("}, {")}}`);
    if (lost.length) problems.push(`${k}: drops {${lost.join("}, {")}}`);
  }
  assert.deepStrictEqual(problems, [], `${label}: ${problems.slice(0, 20).join("; ")}`);
}

async function main() {
  const en = require("./en.js");
  for (const [k, v] of leaves(en)) assert.ok(isWellFormedMessage(v), `en ${k} well formed`);

  // 1. Every LIVE locale with a catalog file has exactly the English key set; drafts may be partial.
  const available = i18n.availableLangs();
  assert.ok(available.includes("en") && available.includes("tr"), "en and tr have catalogs");
  for (const l of registry.locales) {
    if (l.id === "en" || !available.includes(l.id)) continue;
    compareCatalog(`backend/i18n/${l.id}.js`, en, require(`./${l.id}.js`), { partial: l.status !== "live" });
  }

  // 2. bot.* : backend English fallback == app BOT_EN; BOT_TR has the same tree.
  const loc = (f) => pathToFileURL(path.join(__dirname, "..", "..", "src", "i18n", "locales", f)).href;
  const { BOT_EN } = await import(loc("bot.en.js"));
  const { BOT_TR } = await import(loc("bot.tr.js"));
  assert.deepStrictEqual(require("./bot.en.js"), BOT_EN, "backend/i18n/bot.en.js must equal src/i18n/locales/bot.en.js");
  compareCatalog("src/i18n/locales/bot.tr.js", BOT_EN, BOT_TR);

  // 3. The CommonJS formatter renders like the app's src/i18n/message.js.
  const app = await import(pathToFileURL(path.join(__dirname, "..", "..", "src", "i18n", "message.js")).href);
  const samples = [
    ["{count, plural, one {# file} other {# files}} from {name}", { count: 1, name: "a" }, "en-GB"],
    ["{count, plural, one {# file} other {# files}}", { count: 1200 }, "en-GB"],
    ["{count} üye", { count: 3 }, "tr-TR"],
    ["{kind, select, voice {Ses} other {Metin}}", { kind: "voice" }, "tr-TR"],
    ["{{x}} and {y}", { x: 1, y: 2 }, "en-GB"],
    ["plain {not closed", {}, "en-GB"],
  ];
  for (const [str, vars, tag] of samples) assert.strictEqual(formatMessage(str, vars, tag), app.formatMessage(str, vars, tag), str);

  // 4. bt(): language, English fallback, plurals, nested refs; draft languages never chosen.
  assert.strictEqual(i18n.bt("tr", "push.calling", { from: "Ada" }), "Ada arıyor");
  assert.strictEqual(i18n.bt("en", "push.calling", { from: "Ada" }), "Ada is calling");
  assert.strictEqual(i18n.bt("xx", "push.calling", { from: "Ada" }), "Ada is calling", "unknown language -> English");
  assert.strictEqual(i18n.bt("en", "email.common.valid", { minutes: 1 }), "Valid for 1 minute");
  assert.strictEqual(i18n.bt("en", "email.common.valid", { minutes: 10 }), "Valid for 10 minutes");
  assert.strictEqual(i18n.bt("en", "no.such.key"), "no.such.key");
  assert.strictEqual(i18n.pickLang(["de-DE", "tr"], "en"), "de", "live German with a catalog is used");
  assert.strictEqual(i18n.pickLang(["ja-JP", "tr"], "en"), "tr", "unsupported language is skipped");
  assert.strictEqual(i18n.pickLang(["fr"], "tr"), "fr");
  assert.strictEqual(i18n.pickLang(["ja"], "tr"), "tr");
  assert.strictEqual(i18n.requestLang({ headers: { "accept-language": "en-US,en;q=0.9" } }, "tr"), "en");
  assert.strictEqual(i18n.requestLang({ user: { language: "tr" }, headers: { "accept-language": "en" } }, "en"), "tr");
  assert.strictEqual(
    botText.en("bot.notify.messageRequestBody", { from: { key: "bot.notify.someone" } }),
    "Someone sent you a message request",
    "a var that is a { key } ref is rendered first"
  );
  const put = botText.put({}, "title", "bot.slash.purgeDone", { count: 2 });
  assert.deepStrictEqual(put, { title: "2 messages deleted", i18n: { title: { key: "bot.slash.purgeDone", vars: { count: 2 } } } });
  assert.strictEqual(botText.en("bot.game.bjStart", { username: "a", bet: 1000, balance: 25000 }), "**Blackjack** — @a\nBet **1,000** · Balance **25,000**");

  // 5. API messages: static English or { error, errorKey, errorVars }; every phrase has Turkish.
  assert.deepStrictEqual(apiError("Server not found."), { error: "Server not found." });
  assert.deepStrictEqual(apiError("You can own at most {max} servers.", { max: 10 }, { code: "MAX_OWNED_SERVERS" }), {
    error: "You can own at most 10 servers.",
    errorKey: "You can own at most {max} servers.",
    errorVars: { max: 10 },
    code: "MAX_OWNED_SERVERS",
  });
  assert.deepStrictEqual(apiText("message", "Slowmode is on. Try again in {seconds}s.", { seconds: 4 }).messageVars, { seconds: 4 });
  const terr = templatedError("File type {type} is not allowed.", { type: "x/y" }, { status: 400 });
  assert.strictEqual(terr.message, "File type x/y is not allowed.");
  assert.deepStrictEqual(errorFields(terr), { errorKey: "File type {type} is not allowed.", errorVars: { type: "x/y" } });
  assert.deepStrictEqual(errorFields(new Error("x")), {});

  const { API_TR } = await import(loc("api.tr.js"));
  const placeholderProblems = [];
  for (const [k, v] of Object.entries(API_TR)) {
    if (!isWellFormedMessage(v)) placeholderProblems.push(`malformed ${k}`);
    const a = messageArguments(k);
    const b = messageArguments(v);
    const extra = [...b].filter((x) => !a.has(x) && !(CASE_VARIANT.test(x) && a.has(x.replace(CASE_VARIANT, ""))));
    if (extra.length) placeholderProblems.push(`${k}: unknown {${extra.join("}, {")}}`);
    if (/[çğıöşüÇĞİÖŞÜ]/.test(k)) placeholderProblems.push(`Turkish key ${k}`);
  }
  assert.deepStrictEqual(placeholderProblems, []);
  const { missing } = await require("../scripts/apiMessages.cjs").check();
  assert.deepStrictEqual(missing.map(([t, at]) => `${t} (${at})`), [], "every API phrase has Turkish in api.tr.js");

  console.log(`backendI18n.selftest: ok (${leaves(en).size} server keys, ${leaves(BOT_EN).size} bot keys, ${Object.keys(API_TR).length} API phrases)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
