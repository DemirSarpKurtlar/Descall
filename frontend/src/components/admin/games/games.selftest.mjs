// Oyunlar / Kredi (admin, Draft B): pure model, the limits preview matches the
// server's message rules, locale parity in 7 languages, bot English text equals
// the server fallback, type scale tokens only, no emoji.
//   node src/components/admin/games/games.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as M from "./gamesModel.js";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const gameLimits = require("../../../../backend/lib/gameLimits.js");
const DAY = 86400000;
const NOW = Date.parse("2026-11-14T18:00:00.000Z");

/* ---- replay: dealt, hit, dealer, result ---- */
const c = (rank, suit) => ({ rank, suit, value: rank === "A" ? 11 : ["J", "Q", "K"].includes(rank) ? 10 : Number(rank) });
const bjHand = {
  gameType: "blackjack",
  result: "win",
  delta: 2000,
  balanceAfter: 12450,
  player: { cards: [c("A", "♠"), c("7", "♦"), c("3", "♥")], steps: ["deal", "hit", "stand"] },
  dealer: { cards: [c("9", "♣"), c("8", "♠")] },
};
let steps = M.replaySteps(bjHand);
assert.deepEqual(steps.map((s) => s.kind), ["deal", "hit", "dealer", "result"]);
assert.deepEqual(steps[0].noteVars, { player: 18, dealer: 9 }, "soft 18 against a 9");
assert.equal(steps[1].noteVars.n, 21);
assert.equal(steps[2].noteKey, "gamesAdmin.replay.dealerStood");
assert.equal(steps[2].noteVars.n, 17);
assert.equal(steps[3].balanceAfter, 12450);
assert.deepEqual(steps.map((s) => s.index), [1, 2, 3, 4]);
// Bust: no dealer step. Double from the steps list.
steps = M.replaySteps({ ...bjHand, result: "loss", player: { cards: [c("10", "♥"), c("6", "♣"), c("K", "♦")], steps: ["deal", "double"] }, dealer: { cards: [c("10", "♠"), c("7", "♦")] } });
assert.deepEqual(steps.map((s) => s.kind), ["deal", "double", "result"]);
assert.equal(steps[1].noteKey, "gamesAdmin.replay.bust");
// Older rows without steps: rebuilt from the card order, doubled flag.
steps = M.replaySteps({ ...bjHand, player: { cards: [c("5", "♥"), c("6", "♣"), c("9", "♦")], doubled: true }, dealer: { cards: [c("10", "♠"), c("6", "♦"), c("9", "♣")] } });
assert.equal(steps[1].kind, "double");
assert.equal(steps[2].noteKey, "gamesAdmin.replay.dealerBust");
assert.equal(M.handTotal([c("A", "♠"), c("A", "♥"), c("9", "♦")]), 21, "two aces");
assert.equal(M.handTotal([c("K", "♠"), { hidden: true }]), 10);
steps = M.replaySteps({ gameType: "coinflip", result: "win", delta: 1000, player: { call: "heads", face: "heads" } });
assert.deepEqual(steps.map((s) => s.kind), ["call", "face", "result"]);
assert.equal(M.handSummary({ gameType: "coinflip", player: { call: "tails", face: "heads" } }).vars.call, "tails");
steps = M.replaySteps({ gameType: "slot", result: "loss", delta: -500, player: { grid: [["a"]], freeSpins: 2 } });
assert.equal(steps[0].freeSpins, 2);
assert.equal(M.isRedSuit("♦"), true);
assert.equal(M.isRedSuit("♣"), false);

/* ---- ledger rows ---- */
let v = M.ledgerView({ kind: "game", gameType: "blackjack", result: "win", bet: 2000, delta: 2000, context: { kind: "group", label: "Gece Ders Kampı" } });
assert.equal(v.titleKey, "gamesAdmin.ledger.game");
assert.deepEqual(v.titleVars, { game: "gamesAdmin.game.blackjack", result: "gamesAdmin.result.win" });
assert.deepEqual(v.parts, [{ key: "gamesAdmin.ledger.stake", vars: { n: 2000 } }, { key: "gamesAdmin.ledger.ctxGroup", vars: { name: "Gece Ders Kampı" } }]);
assert.equal(v.tone, "green");
assert.equal(M.ledgerView({ kind: "game", gameType: "slot", result: "loss", delta: -500 }).tone, "red");
assert.equal(M.ledgerView({ kind: "transfer_out", counterparty: { username: "zeynep.ak" }, delta: -3000 }).titleVars.name, "zeynep.ak");
v = M.ledgerView({ kind: "admin", actor: "demir", category: "support", reason: "talep #4821", delta: 5000 });
assert.deepEqual(v.parts, [{ key: "gamesAdmin.category.support" }, { text: "talep #4821" }]);
assert.equal(M.ledgerView({ kind: "daily" }).icon, "gift");
assert.deepEqual(M.adjustmentSummary([{ kind: "admin", delta: 5000, at: new Date().toISOString() }, { kind: "admin", delta: -12000, at: new Date().toISOString() }, { kind: "daily", delta: 250, at: new Date().toISOString() }]), { count: 2, net: -7000 });

/* ---- credit dialog ---- */
assert.equal(M.parseAmount("5.000"), 5000);
assert.equal(M.parseAmount("abc"), 0);
assert.equal(M.parseAmount("999999999999"), M.MAX_ADJUST);
assert.equal(M.previewBalance(12450, "add", 5000), 17450);
assert.equal(M.previewBalance(1000, "remove", 5000), 0);
assert.equal(M.previewBalance(1000, "set", 250), 250);
assert.equal(M.canSubmitAdjust({ op: "add", amount: 5000, reason: "Destek telafisi" }), true);
assert.equal(M.canSubmitAdjust({ op: "add", amount: 5000, reason: "kısa" }), false);
assert.equal(M.canSubmitAdjust({ op: "add", amount: 0, reason: "Destek telafisi" }), false);
assert.equal(M.canSubmitAdjust({ op: "set", amount: 0, reason: "Destek telafisi" }), true, "set to 0 is allowed");
const players = [{ id: "a", credits: 30000 }, { id: "b", credits: 15000 }, { id: "c", credits: 12450 }, { id: "d", credits: 99999, flags: { hidden: true } }];
assert.equal(M.rankAfter(players, "c", 17450), 2, "hidden players do not count");

/* ---- limits dialog ---- */
const stored = { maxBet: null, dailyLossCap: null, dailyHandCap: null, transfersEnabled: true, frozenUntil: null, freezeIndefinite: false, expiresAt: null, autoLift: true };
const form = { ...M.limitsForm(stored, NOW), maxBet: 5000, dailyLossCap: 20000, dailyHandCap: 200, transfersEnabled: false, expiresAt: "2026-11-30", reason: "Kullanıcı istedi" };
assert.equal(M.limitsForm(null).maxBet, M.GLOBAL_MAX_BET);
assert.equal(M.limitsForm({ frozenUntil: new Date(NOW + DAY).toISOString() }, NOW).freeze, "keep");
const body = M.limitsBody(form);
assert.deepEqual(
  { maxBet: body.maxBet, dailyLossCap: body.dailyLossCap, dailyHandCap: body.dailyHandCap, transfersEnabled: body.transfersEnabled, freeze: body.freeze, expiresAt: body.expiresAt },
  { maxBet: 5000, dailyLossCap: 20000, dailyHandCap: 200, transfersEnabled: false, freeze: "none", expiresAt: "2026-11-30T23:59:59+03:00" }
);
assert.equal(M.limitsBody({ ...form, maxBet: M.GLOBAL_MAX_BET }).maxBet, null, "the global max = no personal cap");
const diff = M.limitsDiff(stored, form, NOW);
assert.deepEqual(diff.map((d) => [d.id, d.from, d.to, d.changed]), [
  ["maxBet", 25000, 5000, true],
  ["dailyLossCap", null, 20000, true],
  ["dailyHandCap", null, 200, true],
  ["transfers", true, false, true],
  ["freeze", null, null, false],
]);
assert.equal(M.limitsDiff(stored, { ...form, freeze: "7d" }, NOW).find((d) => d.id === "freeze").changed, true);
assert.equal(M.sliderPct("maxBet", 5000), Math.round(((5000 - 10) / (25000 - 10)) * 1000) / 10);
assert.equal(M.sliderPct("dailyLossCap", 20000), 40);
assert.equal(M.sliderPct("dailyHandCap", 200), 50);
assert.deepEqual(M.limitParts({ maxBet: 5000, dailyLossCap: 20000, expiresAt: "2026-11-30" }).map((p) => p.key), ["gamesAdmin.limits.partMaxBet", "gamesAdmin.limits.partLoss", "gamesAdmin.limits.partUntil"]);

// The preview names the same message the server sends (lib/gameLimits.js).
const cases = [
  form,
  { ...form, dailyLossCap: 0 },
  { ...form, dailyLossCap: 0, dailyHandCap: 0 },
  { ...form, dailyLossCap: 0, dailyHandCap: 0, maxBet: M.GLOBAL_MAX_BET },
  { ...form, freeze: "7d" },
  { ...form, freeze: "forever" },
  { ...form, dailyLossCap: 0, dailyHandCap: 0, maxBet: M.GLOBAL_MAX_BET, transfersEnabled: true, expiresAt: "" },
];
for (const f of cases) {
  const limits = M.formLimits(f, stored, NOW);
  const mine = M.previewNotice(limits);
  const server = gameLimits.previewNotice(limits);
  assert.deepEqual(mine, server, `preview parity ${JSON.stringify(f)}`);
}
assert.equal(M.previewNotice(M.formLimits(form, stored, NOW)).vars.main.key, "gamesAdmin.bot.dailyLoss");
assert.equal(gameLimits.englishOf(M.previewNotice(M.formLimits(form, stored, NOW))).startsWith("You reached today's loss limit (20,000 credits)."), true);

/* ---- chart + misc ---- */
const g = M.chartGeometry([1, 3, 2], [0, 5, 10], { width: 100, height: 50, pad: 0 });
assert.deepEqual(g.xs, [0, 50, 100]);
assert.equal(g.ys[1], 0, "max at the top");
assert.equal(g.ys[0], 50, "min at the bottom");
assert.equal(g.bars[2].h, 50 * 0.55);
assert.equal(M.chartGeometry([], []).line, "");
assert.equal(M.deltaTone(-1), "neg");
const link = M.handLink("https://descall.com/", "00000000-0000-4000-8000-000000000010", "00000000-0000-4000-8000-000000001001");
assert.equal(link, "https://descall.com/admin/panel#games/00000000-0000-4000-8000-000000000010/00000000-0000-4000-8000-000000001001");
assert.deepEqual(M.parseHandLink(link.slice(link.indexOf("#"))), { userId: "00000000-0000-4000-8000-000000000010", handId: "00000000-0000-4000-8000-000000001001" });
assert.equal(M.parseHandLink("#people/x"), null);
assert.equal(M.qs({ a: 1, b: "", c: null, d: "x y" }), "?a=1&d=x+y");
assert.equal(M.foldTr("İREM"), "irem");
assert.equal(M.flagDot({ risk: "high" }), "red");
assert.equal(M.flagDot({ risk: null, frozen: true }), "violet");
assert.equal(M.anomalyView({ type: "multiTransfer", severity: "high" }).sev, "red");
assert.equal(M.gradientFor("x"), M.gradientFor("x"));
assert.equal(M.initialOf({ username: "iremsu" }), "İ");

/* ---- locales: same keys + placeholders in 7 languages ---- */
const locDir = join(here, "..", "..", "..", "i18n", "locales");
const LOCALES = { tr: "GAMES_ADMIN_TR", en: "GAMES_ADMIN_EN", de: "GAMES_ADMIN_DE", es: "GAMES_ADMIN_ES", fr: "GAMES_ADMIN_FR", "pt-BR": "GAMES_ADMIN_PT_BR", ru: "GAMES_ADMIN_RU" };
const flat = (o, p = "", out = {}) => {
  for (const [k, val] of Object.entries(o)) {
    if (val && typeof val === "object") flat(val, p ? `${p}.${k}` : k, out);
    else out[p ? `${p}.${k}` : k] = val;
  }
  return out;
};
const cats = {};
for (const [id, name] of Object.entries(LOCALES)) {
  const mod = await import(pathToFileURL(join(locDir, `gamesAdmin.${id}.js`)).href);
  cats[id] = flat(mod[name]);
  const main = readFileSync(join(locDir, `${id}.js`), "utf8");
  assert.ok(main.includes(`from "./gamesAdmin.${id}.js"`) && new RegExp(`["']?gamesAdmin["']?:\\s*${name}`).test(main), `${id}: gamesAdmin registered`);
}
const placeholders = (s) =>
  [...String(s).matchAll(/\{\s*(\w+)\s*[,}]/g)]
    .map((m) => m[1])
    .filter((x, i, a) => a.indexOf(x) === i)
    .sort();
const enKeys = Object.keys(cats.en).sort();
for (const [id, cat] of Object.entries(cats)) {
  assert.deepEqual(Object.keys(cat).sort(), enKeys, `${id}: same keys as en`);
  for (const k of enKeys) {
    assert.ok(String(cat[k]).trim().length > 0, `${id}.${k} empty`);
    assert.deepEqual(placeholders(cat[k]), placeholders(cats.en[k]), `${id}.${k} placeholders`);
  }
}
// Every key the code asks for exists.
const code = readdirSync(here).filter((f) => /\.(jsx|js)$/.test(f) && !f.includes("selftest")).map((f) => readFileSync(join(here, f), "utf8")).join("\n");
for (const m of code.matchAll(/["'`]gamesAdmin\.([A-Za-z0-9_.]+)["'`]/g)) {
  assert.ok(m[1] in cats.en, `missing key gamesAdmin.${m[1]}`);
}
const dynamic = [
  ...["support", "event", "bugfix", "abuse", "other"].map((x) => `category.${x}`),
  ...["add", "remove", "set"].map((x) => `credit.op_${x}`),
  ...["1", "7", "30", "90", "all"].map((x) => `drawer.days_${x}`),
  ...["normal", "review"].map((x) => `fair.${x}`),
  ...["normal", "high", "low", "few"].map((x) => `fair.band_${x}`),
  ...["all", "game", "bonus", "transfer", "admin"].map((x) => `ledger.f_${x}`),
  ...["maxBet", "dailyLossCap", "dailyHandCap", "transfers", "freeze"].map((x) => `limits.diff_${x}`),
  ...["none", "24h", "7d", "30d", "forever"].map((x) => `limits.freeze_${x}`),
  ...["red", "amber", "violet"].map((x) => `list.flag_${x}`),
  ...["bet", "start", "daily", "bj", "slot", "coin", "idle", "limits"].map((x) => `rules.${x}`),
  ...["wild", "scatter", "seven", "diamond", "crown", "bell", "bar", "cherry", "ace", "king", "queen"].map((x) => `slot.${x}`),
  ...["high", "medium", "low"].map((x) => `severity.${x}`),
  ...["streak", "winRate", "multiTransfer", "farming", "jump"].flatMap((x) => [`anomaly.${x}`, `anomaly.${x}Sub`]),
  ...["blackjack", "slot", "coinflip"].flatMap((x) => [`game.${x}`, `game.${x}Long`]),
  ...["heads", "tails"].map((x) => `coin.${x}`),
];
for (const k of dynamic) assert.ok(k in cats.en, `missing dynamic key gamesAdmin.${k}`);

// The server's English bot text is the app's English text.
const enBot = Object.fromEntries(Object.entries(cats.en).filter(([k]) => k.startsWith("bot.")).map(([k, val]) => [k.slice(4), val]));
assert.deepEqual(enBot, { ...gameLimits.BOT_EN }, "backend/lib/gameLimits.js BOT_EN == gamesAdmin.en.js bot");

/* ---- styles: type scale tokens only; no emoji anywhere ---- */
const css = readFileSync(join(here, "..", "..", "..", "styles", "admin-games.css"), "utf8");
for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
  assert.match(m[1].trim(), /^var\(--fs-(11|12|13|15|17|20|28)\)( !important)?$/, `font-size ${m[1]}`);
}
assert.ok(!/(^|[^-])font:\s*\d/.test(css), "no shorthand font sizes");
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
const sources = [code, css, ...Object.keys(LOCALES).map((id) => readFileSync(join(locDir, `gamesAdmin.${id}.js`), "utf8"))];
for (const s of sources) {
  // Card suits (U+2660-2667) are text glyphs, not emoji: allowed.
  assert.ok(!emoji.test(s.replace(/[♠-♧]/g, "")), "no emoji");
}

console.log("games selftest ok");
