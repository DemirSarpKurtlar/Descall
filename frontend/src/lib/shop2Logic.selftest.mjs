// Market 2.0 user side: pure rules (pricing, storefront, night market, gifts, action log,
// try-on), the docs/shop2-api.md shapes the normalisers read, the shop2.* catalogs in all 7
// languages (same keys, same placeholders, no emoji, no banned words) and the type scale of
// styles/shop2-ui.css. Run: node src/lib/shop2Logic.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  canRecall,
  celebrationParticles,
  composeTryOnUser,
  countdownParts,
  currentLook,
  filterRecipients,
  giftWhen,
  isRetiredItem,
  markWishlist,
  messageCount,
  mmss,
  nightSummary,
  normalizeGift,
  normalizeHistory,
  normalizeNightMarket,
  normalizeRecipient,
  normalizeSet,
  normalizeStorefront,
  outfitDiff,
  paletteMatch,
  priceHistoryStats,
  refreshPlan,
  setPricing,
  setProgress,
  setTryOn,
  sparkPath,
  stepPath,
  toggleLock,
  undoLeft,
  windowLeft,
  windowProgress,
  SET_PIECE_ORDER,
  SHOP2_REFUND_MS,
  SHOP2_RECALL_MS,
} from "./shop2Logic.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..");
const T0 = Date.parse("2026-11-15T20:00:00Z");

// ---------- storefront (docs/shop2-api.md GET /storefront) ----------
const item = (id, category, price, extra = {}) => ({ id, sku: `s2-${category}-${id}`, category, price_descoin: price, rarity: "rare", ...extra });
const sf = normalizeStorefront({
  day: "2026-11-15",
  resetsAt: "2026-11-15T21:00:00Z",
  slots: [
    { slot: 1, item: item("a", "banner", 480, { i18n: { name: { tr: "Kuzey Işığı", en: "Northern Light" } } }), price: 480, locked: false },
    { slot: 2, item: item("b", "profile_color", 260), price: 260 },
    { slot: 3, item: item("c", "chat_bubble", 190), price: 190, owned: true },
    { slot: 4, item: item("d", "avatar_effect", 780), price: 620 },
  ],
  lock: { itemId: "a", slot: 1 },
  refresh: { available: true, price: 120, free: null, used: 0, perDay: 1 },
  nightMarket: { open: true, startsAt: "2026-11-15T18:00:00Z", endsAt: "2026-11-15T21:12:00Z", cards: 6, flipsLeft: 2, keepMax: 2 },
  featuredSets: [{ key: "gece-mercani", name: { tr: "Gece Mercanı" }, palette: ["#0c0a1f", "#d6336c", "#ff8fab", "#7c5cff"], sum: 4620, setPrice: 3510, yourPrice: 2902, owned: 2, total: 8 }],
  yesterday: [{ slot: 1, item: item("y", "voice_tile", 560), owned: false }],
  wishlistHits: ["b"],
  balance: 2940,
});
assert.equal(sf.slots.length, 4);
assert.equal(sf.slots[0].index, 1, "slot number from the API");
assert.equal(sf.slots[0].locked, true, "lock.itemId marks the slot");
assert.equal(sf.lockedItemId, "a");
assert.deepEqual(sf.slots[0].item.name, { tr: "Kuzey Işığı", en: "Northern Light" }, "i18n names are read");
assert.equal(sf.slots[1].wishlisted, true, "wishlistHits flag the card");
assert.equal(sf.slots[3].discountPct, 21, "price under the list price is a discount");
assert.equal(sf.nightMarket.open, true);
assert.equal(sf.nightMarket.closesAt, Date.parse("2026-11-15T21:12:00Z"));
assert.equal(sf.featuredSets[0].ownedCount, 2, "setCard.owned is a count");
assert.equal(sf.featuredSets[0].yourPrice, 2902);
assert.equal(sf.yesterday[0].id, "y");
assert.equal(sf.balance, 2940);

// refresh confirm: locked card stays, cart warning for the cards that leave
const plan = refreshPlan(sf, { balance: 2940, cartIds: ["b", "zzz"] });
assert.equal(plan.changingCount, 3);
assert.equal(plan.kept[0].id, "a");
assert.deepEqual(plan.cartLosing.map((i) => i.id), ["b"]);
assert.equal(plan.balanceAfter, 2820);
assert.equal(plan.affordable, true);
assert.equal(refreshPlan({ ...sf, refresh: { ...sf.refresh, freeFromStreak: true } }, { balance: 0 }).price, 0, "a free refresh costs nothing");
// one lock: locking another card moves it, locking the same one again removes it
const moved = toggleLock(sf.slots, "b");
assert.deepEqual(moved.map((s) => s.locked), [false, true, false, false]);
assert.deepEqual(toggleLock(moved, "b").map((s) => s.locked), [false, false, false, false]);
assert.equal(markWishlist(sf.slots, [{ id: "d" }])[3].wishlisted, true);

// ---------- sets (GET /sets/:key) ----------
// 9 pieces (the profile aura is third); the name colour + badge (800) are owned.
assert.equal(SET_PIECE_ORDER.length, 9);
assert.equal(SET_PIECE_ORDER[2], "profile_aura", "every set carries a profile aura");
const pieces = SET_PIECE_ORDER.map((category, i) => ({ category, item: item(`p${i}`, category, [900, 720, 400, 380, 420, 840, 420, 240, 300][i]), owned: i === 3 || i === 4 }));
const raw = { key: "gece-limani", name: { tr: "Gece Limanı" }, palette: ["#0b1b3a", "#1e4b8f", "#35d0e0", "#e8f6ff"], pieces: [...pieces].reverse(), sum: 4620, setPrice: 3470, discountPct: 25, yourPrice: null, priceHistory30d: [{ day: "a", price: 3900 }, { day: "b", price: 3470 }], title: { name: { tr: "Liman Ustası" } }, lookingNow: 12, friendOwners: [{ id: 1 }] };
const set = normalizeSet(raw);
assert.deepEqual(set.pieces.map((p) => p.item.category), SET_PIECE_ORDER, "pieces in set order");
assert.equal(set.setRateClosed, true, "yourPrice: null = the set rate is closed");
assert.equal(set.viewersNow, 12);
assert.deepEqual(set.reward.title, { tr: "Liman Ustası" });
const pr = setPricing(set);
assert.equal(pr.sum, 4620);
assert.equal(pr.setPrice, 3470);
assert.equal(pr.ownedCount, 2);
assert.equal(pr.ownedDeduction, Math.round(800 * (3470 / 4620)), "owned pieces deducted at the set rate");
assert.equal(pr.yourPrice, 3470 - pr.ownedDeduction);
assert.equal(pr.missingCount, 7);
assert.equal(pr.missingSingles, 4620 - 800);
assert.ok(pr.savingVsSingles > 0, "the set beats buying the rest one by one");
assert.ok(pr.discountPct >= 20 && pr.discountPct <= 30, "set price 20-30 % below the pieces");
// the server's yourPrice wins when it sent one
const srv = setPricing(normalizeSet({ ...raw, yourPrice: 2870, ownedDeducted: 600 }));
assert.equal(srv.yourPrice, 2870);
assert.equal(srv.ownedDeduction, 600);
// chosen pieces: singles price, or the set rate inside the 7-day window
const two = setPricing(set, { selectedIds: ["p0", "p1"], now: T0 });
assert.equal(two.selectedCount, 2);
assert.equal(two.selectedTotal, 1620);
const partial = setPricing({ ...set, partialPriceUntil: T0 + 86400000 }, { selectedIds: ["p0", "p1"], now: T0 });
assert.equal(partial.partialActive, true);
assert.equal(partial.selectedTotal, Math.round((1620 * (3470 / 4620)) / 10) * 10, "partial price: list sum at the set rate, rounded to 10 like the server");
assert.equal(setPricing(set, { selectedIds: pieces.filter((p) => !p.owned).map((p) => p.item.id) }).selectedTotal, pr.yourPrice, "choosing every missing piece is the set price");
assert.deepEqual(setProgress(set), { owned: 2, total: 9, left: 7, pct: 2 / 9 });

// price history
const hs = priceHistoryStats([{ price: 3900 }, { price: 3600 }, { price: 3470 }], 3470);
assert.equal(hs.min, 3470);
assert.equal(hs.isLowest, true);
assert.equal(hs.previousLowest, 3600);
assert.equal(priceHistoryStats([432, 500], 297).pctBelowPrevLow, 31, "night deal vs. the previous low");
assert.match(sparkPath([1, 3, 2], 100, 30), /^M2\.0 /);
assert.match(stepPath([1, 3, 2], 100, 30), / H/);
assert.equal(sparkPath([1]), "");

// ---------- time ----------
const cd = countdownParts(T0 + 2 * 3600e3 + 17 * 60e3 + 42e3, T0);
assert.equal(cd.text, "02:17:42");
assert.equal(cd.urgent, false);
assert.equal(countdownParts(T0 + 9 * 60e3, T0).urgent, true, "last 10 minutes are urgent");
assert.equal(countdownParts(T0 - 1, T0).done, true);
// Night market opening days away: days + remaining hours for "2g 21s" (was "69:39:08").
const far = countdownParts(T0 + 69 * 3600e3 + 39 * 60e3 + 8e3, T0);
assert.equal(far.days, 2);
assert.equal(far.hoursLeft, 21);
assert.equal(cd.days, 0);
assert.equal(windowLeft(T0, SHOP2_REFUND_MS, T0 + 60e3), 540);
assert.equal(windowLeft(T0, SHOP2_RECALL_MS, T0 + 10 * 60e3), 0);
assert.equal(mmss(132), "02:12");
assert.equal(windowProgress(T0, T0 + 100, T0 + 25), 0.25);

// ---------- try-on ----------
const me = { id: "me", equippedBanner: { id: "old", category: "banner" }, equippedChatBubble: { id: "b1" } };
const tryOn = setTryOn(set, new Set(["p6"]));
assert.equal(Object.keys(tryOn).length, 8, "a hidden piece (eye off) is not tried on");
const user = composeTryOnUser(me, tryOn);
assert.equal(user.equippedBanner.id, "p1");
assert.equal(user.equippedAvatarFrame.id, "p0");
assert.equal(user.equippedVoiceTile.id, "p7");
assert.equal(user.equippedProfileAura.id, "p2", "the set aura is tried on with the rest");
assert.equal(user.equippedJoinSound.id, "p8");
assert.equal(user.equippedChatBubble.id, "b1", "slots the set does not touch keep what is worn");
assert.equal(me.equippedBanner.id, "old", "the real user object is not changed");
assert.deepEqual(currentLook(me), { banner: "old", chat_bubble: "b1" });
assert.deepEqual(outfitDiff(me, { banner: "p1", chat_bubble: "b1" }), [{ category: "banner", from: "old", to: "p1" }]);
const parts = celebrationParticles(set.palette);
assert.equal(parts.length, 40, "40 particles in the set colours");
assert.ok(parts.every((p) => set.palette.includes(p.color)));
const score = paletteMatch(set.palette, ["#33ccdd", "#ff00aa"]);
assert.ok(score > 40 && score < 90, `palette match ${score}`);
assert.equal(paletteMatch(set.palette, []), null);

// ---------- night market (GET /night-market) ----------
const nm = normalizeNightMarket({
  open: true,
  night: { id: "n1", startsAt: "2026-11-15T18:00:00Z", endsAt: "2026-11-15T21:00:00Z" },
  flips: { total: 3, used: 1, left: 2, coOpenBonus: 1 },
  keepMax: 2,
  cards: [
    { index: 0, flipped: false, hint: "banner" },
    { index: 1, flipped: true, hint: "banner", item: item("m", "banner", 540), rarity: "epic", discountPct: 45, listPrice: 540, price: 297, kept: true, bought: true },
  ],
  savings: 243,
  log: [{ at: "2026-11-15T19:00:00Z", cardIndex: 1, kind: "flip" }],
});
assert.equal(nm.flipsLeft, 2);
assert.equal(nm.coOpenBonus, 1);
assert.equal(nm.cards[1].basePrice, 540);
assert.equal(nm.cards[1].price, 297);
assert.equal(nm.log[0].item.id, "m", "log rows name the opened item");
assert.deepEqual(nightSummary(nm), { opened: 1, kept: 1, flipsLeft: 2, flipsTotal: 3, saved: 243, canKeepMore: true });
assert.equal(normalizeNightMarket({ open: false, next: { startsAt: "2026-11-16T18:00:00Z" } }).nextOpensAt, Date.parse("2026-11-16T18:00:00Z"));

// ---------- gifts ----------
const g = normalizeGift({ id: "g1", status: "delivered", to: { id: "f" }, items: [item("i", "banner", 480)], amount: 480, createdAt: "2026-11-15T19:58:00Z", anonymous: true, hidden: true, canRecall: true });
assert.equal(g.item.id, "i");
assert.equal(g.hideName, true);
assert.equal(g.hiddenItem, true);
assert.equal(g.price, 480);
assert.equal(canRecall(g), true);
assert.equal(canRecall({ ...g, canRecall: null, status: "opened" }), false, "opened gifts cannot be recalled");
assert.equal(canRecall({ ...g, canRecall: null, sentAt: T0 }, T0 + 4 * 60e3), true, "inside 5 minutes");
assert.equal(canRecall({ ...g, canRecall: null, sentAt: T0 }, T0 + 6 * 60e3), false);
const rec = [
  normalizeRecipient({ user: { id: 1, displayName: "Ece", status: "online" }, ownsAll: false, wishlisted: false, canReceive: true }),
  normalizeRecipient({ user: { id: 2, displayName: "Selin" }, ownsAll: true }),
  normalizeRecipient({ user: { id: 3, displayName: "Kaan" }, wishlisted: true, owned: 3, total: 8 }),
];
assert.equal(rec[2].ownedCount, 3);
assert.deepEqual(filterRecipients(rec, "all").map((f) => f.id), [3, 1, 2], "wishlist matches first, owners last");
assert.deepEqual(filterRecipients(rec, "notOwned").map((f) => f.id), [3, 1]);
assert.deepEqual(filterRecipients(rec, "online").map((f) => f.id), [1]);
assert.deepEqual(filterRecipients(rec, "all", "kaa").map((f) => f.id), [3]);
// "Deliver on their birthday" was removed: no birthday fields, no birthday filter, and a
// saved draft that still says "birthday" opens on "at a time" with no time picked.
const bdayRec = normalizeRecipient({ user: { id: 4, displayName: "Deniz" }, birthdayAt: "2026-12-01T00:00:00Z", birthdayInDays: 2 });
assert.equal(bdayRec.birthdayAt, undefined, "the normaliser no longer lifts birthdayAt");
assert.equal(bdayRec.birthdayInDays, undefined, "the normaliser no longer lifts birthdayInDays");
assert.deepEqual(filterRecipients(rec, "birthday").map((f) => f.id), filterRecipients(rec, "all").map((f) => f.id), "no birthday filter");
assert.equal(giftWhen(undefined), "now");
assert.equal(giftWhen(""), "now");
assert.equal(giftWhen("now"), "now");
assert.equal(giftWhen("at"), "at");
assert.equal(giftWhen("birthday"), "at", "old birthday drafts are never sent at once");
assert.equal(messageCount("İyi ki doğdun"), 13);

// ---------- action log (GET /history) ----------
const hist = normalizeHistory({ entries: [
  { id: "h1", kind: "purchase", at: new Date(T0).toISOString(), payload: { items: [item("c", "chat_bubble", 190)], amount: -190 }, undoable: true, undoUntil: new Date(T0 + 6 * 60e3).toISOString() },
  { id: "h2", kind: "gift_send", at: new Date(T0 - 1000).toISOString(), payload: { to: { displayName: "Mert" } } },
  { id: "h3", kind: "equip", at: new Date(T0 - 2000).toISOString(), undoable: true, undoneAt: new Date(T0).toISOString() },
] });
assert.equal(hist[0].item.id, "c");
assert.equal(hist[1].kind, "gift_sent");
assert.equal(hist[2].undoable, false, "already undone");
assert.equal(undoLeft(hist[0], T0 + 60e3), 300);
// Signed amounts: spent (server logs it positive) reads negative, a recall refund positive.
const signed = normalizeHistory({ entries: [
  { id: "a", kind: "purchase", at: new Date(T0).toISOString(), payload: { amount: 420 } },
  { id: "b", kind: "refresh", at: new Date(T0 - 1).toISOString(), payload: { paid: 150 } },
  { id: "c", kind: "gift_send", at: new Date(T0 - 2).toISOString(), payload: { amount: 460, to: "u-2" }, to: { id: "u-2", displayName: "Mert" } },
  { id: "d", kind: "gift_recall", at: new Date(T0 - 3).toISOString(), payload: { refunded: 460 } },
  { id: "e", kind: "refund", at: new Date(T0 - 4).toISOString(), payload: { amount: 420 } },
] });
assert.deepEqual(signed.map((x) => x.amount), [-420, -150, -460, 460, 420]);
assert.equal(signed[2].to.displayName, "Mert", "decorated recipient wins over the payload id");

// ---------- retired ----------
assert.equal(isRetiredItem({ sku: "banner-aurora", category: "banner" }), true);
assert.equal(isRetiredItem({ sku: "s2-banner-x", category: "banner" }), false);
assert.equal(isRetiredItem({ sku: "tr", category: "countries" }), false, "flags stay as they are");

// ---------- shop2.* catalogs: 7 languages ----------
const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
const vars = (s) => [...new Set([...String(s).matchAll(/\{(\w+)(?:,|\})/g)].map((m) => m[1]))].sort();
const catalogs = {};
for (const l of LOCALES) {
  const mod = await import(pathToFileURL(join(src, "i18n/locales", `shop2.${l}.js`)).href);
  const obj = Object.values(mod)[0];
  catalogs[l] = Object.fromEntries(flat(obj));
}
const enKeys = Object.keys(catalogs.en).sort();
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;
for (const l of LOCALES) {
  assert.deepEqual(Object.keys(catalogs[l]).sort(), enKeys, `${l}: same keys as en`);
  for (const [k, v] of Object.entries(catalogs[l])) {
    assert.equal(typeof v, "string", `${l}.${k}: string`);
    assert.ok(v.trim(), `${l}.${k}: not empty`);
    assert.deepEqual(vars(v), vars(catalogs.en[k]), `${l}.${k}: placeholders match en`);
    assert.equal(EMOJI.test(v), false, `${l}.${k}: no emoji`);
    assert.equal(/valorant|tak[ıi]m bul/i.test(v), false, `${l}.${k}: banned word`);
  }
}

// ---------- UI source: no emoji, every t("shop2.*") key exists ----------
const uiFiles = readdirSync(join(src, "components/shop2")).filter((f) => /\.jsx?$/.test(f) && !/selftest/.test(f));
const keys = new Set(enKeys.map((k) => `shop2.${k}`));
for (const f of uiFiles) {
  const s = readFileSync(join(src, "components/shop2", f), "utf8");
  assert.equal(EMOJI.test(s), false, `${f}: no emoji`);
  assert.equal(/valorant|tak[ıi]m bul/i.test(s), false, `${f}: banned word`);
  for (const m of s.matchAll(/t\(\s*"(shop2\.[\w.]+)"/g)) assert.ok(keys.has(m[1]), `${f}: missing string ${m[1]}`);
}

// ---------- type scale: only --fs-11/12/13/15/17/20/28 ----------
// Exception: container units (cqw). The gift preview phone (.s2-gphone) is a scaled
// picture of a phone screen, not app text; its sizes follow the phone's width.
const css = readFileSync(join(src, "styles/shop2-ui.css"), "utf8");
for (const m of css.matchAll(/font(?:-size)?\s*:\s*([^;]+);/g)) {
  const v = m[1];
  if (/\dcqw/.test(v) && !/px/.test(v)) continue;
  assert.equal(/\d+(\.\d+)?px/.test(v.replace(/\/\s*[\d.]+/, "")) && !/var\(--fs-/.test(v), false, `literal px font size: ${v}`);
  for (const t of v.matchAll(/--fs-(\d+)/g)) assert.ok(["11", "12", "13", "15", "17", "20", "28"].includes(t[1]), `off-scale token --fs-${t[1]}`);
}
assert.equal(/font-size:\s*\d(?![\d.]*cqw)/.test(css), false, "no literal font-size");
assert.equal([...css.matchAll(/^([^{}\n]+)\{[^}]*font(?:-size)?\s*:[^;]*\dcqw/gm)].every((m) => /\.s2-gphone|\.s2-gopened/.test(m[1])), true, "cqw font sizes only inside the gift preview phone");
assert.equal(EMOJI.test(css), false, "no emoji in the styles");

console.log(`shop2Logic.selftest ok (${enKeys.length} strings x ${LOCALES.length} languages, ${uiFiles.length} UI files)`);

// ---------- look links (backend lib/shop2/share.js) ----------
{
  const L = await import(pathToFileURL(join(src, "lib/shop2Look.js")).href);
  assert.deepEqual(L.parseLookText("Yeni görünüm\nhttps://descall.com/shop/look/set/gece-limani"), { kind: "set", ref: "gece-limani", note: "Yeni görünüm", link: "https://descall.com/shop/look/set/gece-limani" });
  assert.equal(L.parseLookText("https://descall.com/shop/look/item/abc-123").ref, "abc-123");
  assert.equal(L.parseLookText("https://descall.com/shop"), null);
  assert.equal(L.isLookText("bak: https://x.app/shop/look/item/9"), true);
  assert.equal(L.isLookText("https://x.app/shop/look/"), false);
  assert.deepEqual(L.parseLookPath("/shop/look/set/kuzey-isigi"), { kind: "set", ref: "kuzey-isigi" });
  assert.equal(L.parseLookPath("/shop/look/hat/x"), null);
  let went = null;
  assert.equal(L.handleShopLookPath("/shop/look/item/42", (p, o) => { went = [p, o]; }), true);
  assert.deepEqual(went, ["/settings/shop", { replace: true }]);
  assert.deepEqual({ kind: L.peekShop2Focus().kind, ref: L.peekShop2Focus().ref }, { kind: "item", ref: "42" });
  assert.equal(L.takeShop2Focus().ref, "42");
  assert.equal(L.takeShop2Focus(), null, "taken once");
  assert.equal(L.handleShopLookPath("/settings/shop", () => {}), false);
  const ml = readFileSync(join(src, "components/chat/MessageList.jsx"), "utf8");
  assert.match(ml, /isLookText\(message\.text\)/, "chat renders look cards");
  console.log("shop2Look ok");
}
