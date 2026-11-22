// Market 2.0 user UI: server-render of every tab with a fake market context (storefront
// cards + live preview panel, console list, sets cabin + kasa, stage, night market, gifts,
// inventory with "Eski koleksiyon", wishlist, checkout and the celebration) on desktop and
// phone. Catches crashes and checks the draft A + C structure is there.
// Run: node src/components/shop2/shop2.render.selftest.mjs
import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../..");
const out = mkdtempSync(join(tmpdir(), "shop2-"));
const J = (p) => JSON.stringify(join(src, p));
const entry = `
import { renderToString } from "react-dom/server";
import { createElement as h } from "react";
import ReactDOM from "react-dom";
ReactDOM.createPortal = (children) => children;
import { LocaleProvider } from ${J("context/LocaleContext.jsx")};
import { Shop2Ctx } from ${J("components/shop2/Shop2Context.js")};
import Shop2Vitrin from ${J("components/shop2/Shop2Vitrin.jsx")};
import Shop2Sets from ${J("components/shop2/Shop2Sets.jsx")};
import Shop2Night from ${J("components/shop2/Shop2Night.jsx")};
import Shop2Gifts from ${J("components/shop2/Shop2Gifts.jsx")};
import Shop2Inventory, { Shop2Wishlist } from ${J("components/shop2/Shop2Inventory.jsx")};
import Shop2Checkout from ${J("components/shop2/Shop2Checkout.jsx")};
import Shop2Market from ${J("components/shop2/Shop2Market.jsx")};
import LookCardFromText from ${J("components/shop2/LookCard.jsx")};
import Shop2Share from ${J("components/shop2/Shop2Share.jsx")};
import { ItemDetail, SetQuickPanel } from ${J("components/shop2/Shop2Detail.jsx")};
import Shop2Search from ${J("components/shop2/Shop2Search.jsx")};
import ShopItemThumb from ${J("components/shop/ShopItemThumb.jsx")};
import { firstChannels } from ${J("components/shop2/Shop2Stage.jsx")};
import * as L from ${J("lib/shop2Logic.js")};
export { L, firstChannels };
const C = { look: LookCardFromText, share: Shop2Share, vitrin: Shop2Vitrin, sets: Shop2Sets, night: Shop2Night, gifts: Shop2Gifts, inv: Shop2Inventory, wish: Shop2Wishlist, checkout: Shop2Checkout, detail: ItemDetail, setq: SetQuickPanel, search: Shop2Search, thumb: ShopItemThumb };
export function render(name, ctx, props = {}) {
  return renderToString(h(LocaleProvider, { meLanguage: "tr" }, h(Shop2Ctx.Provider, { value: ctx }, h(C[name], props))));
}
export function renderMarket(props) {
  return renderToString(h(LocaleProvider, { meLanguage: "tr" }, h(Shop2Market, props)));
}
`;
const file = join(out, "bundle.mjs");
await build({
  stdin: { contents: entry, resolveDir: src, loader: "jsx" },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: file,
  jsx: "automatic",
  logLevel: "silent",
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /\?(url|raw|worker|inline|worker&url)$/ }, (args) => ({ path: args.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default 'stub';", loader: "js" }));
    },
  }],
  loader: { ".css": "empty", ".png": "empty", ".svg": "empty", ".mp3": "empty", ".webp": "empty", ".gif": "empty", ".woff2": "empty" },
  define: { "import.meta.env": JSON.stringify({ MODE: "test", DEV: false, PROD: true }) },
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});

const mem = new Map();
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.navigator ??= { userAgent: "node", vibrate() {} };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.location ??= { hostname: "descall.com", href: "https://descall.com/", pathname: "/", search: "", hash: "", origin: "https://descall.com", protocol: "https:" };
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.dispatchEvent ??= () => true;
const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, appendChild() {}, addEventListener() {}, removeEventListener() {}, dataset: {} });
globalThis.document ??= { documentElement: el(), body: el(), head: el(), createElement: el, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, removeEventListener() {}, visibilityState: "visible", hidden: false, cookie: "" };
for (const k of ["HTMLElement", "SVGElement", "Element", "Node", "Event", "CustomEvent", "Image", "ResizeObserver", "IntersectionObserver", "MutationObserver"]) globalThis[k] ??= class { observe() {} disconnect() {} unobserve() {} addEventListener() {} };
const reactErrors = [];
const origError = console.error;
console.error = (...a) => {
  if (/useLayoutEffect does nothing on the server/.test(String(a[0]))) return;
  reactErrors.push(String(a[0]));
  origError(...a);
};

const m = await import(pathToFileURL(file).href);
const { L } = m;
const NOW = Date.now();
const it = (id, category, price, tr, extra = {}) => ({ id, sku: `s2-${category}-${id}`, category, price_descoin: price, rarity: "epic", name: { tr, en: tr }, ...extra });
const ORDER = L.SET_PIECE_ORDER;
const NAMES = ["Fener Halkası", "Sisli Rıhtım", "Dalga Mavisi", "Pusula", "Ay Tozu", "Şamandıra", "Gece Vardiyası", "Liman Çanı"];
const set = L.normalizeSet({
  key: "gece-limani", name: { tr: "Gece Limanı" }, palette: ["#0b1b3a", "#1e4b8f", "#35d0e0", "#e8f6ff"],
  pieces: ORDER.map((c, i) => ({ category: c, item: it(`p${i}`, c, 400 + i * 50, NAMES[i], c === "voice_tile" ? { effect_key: "vt-gece-limani" } : c === "join_sound" ? { effect_key: "js-gece-limani" } : {}), owned: i === 2 || i === 3 })),
  sum: 4600, setPrice: 3450, yourPrice: 2870, ownedDeducted: 580, priceHistory30d: [{ price: 3900 }, { price: 3450 }], title: { name: { tr: "Liman Ustası" } }, lookingNow: 12, ownersCount: 1284, endsAt: new Date(NOW + 5 * 864e5).toISOString(),
});
const storefront = L.normalizeStorefront({
  day: "2026-11-15", resetsAt: new Date(NOW + 2 * 3600e3).toISOString(),
  slots: [
    { slot: 1, item: it("a", "banner", 480, "Kuzey Işığı"), price: 480 },
    { slot: 2, item: it("b", "profile_color", 260, "Bakır Kıvılcım", { effect_key: "s2-set-bakir-kervan" }), price: 260 },
    { slot: 3, item: it("c", "chat_bubble", 190, "Sis Balonu", { effect_key: "s2-cloud-puff" }), price: 190 },
    { slot: 4, item: it("d", "avatar_effect", 780, "Yankı Halkası"), price: 620 },
  ],
  lock: { itemId: "a" },
  refresh: { available: true, price: 120, used: 0, perDay: 1 },
  nightMarket: { open: true, startsAt: new Date(NOW - 3600e3).toISOString(), endsAt: new Date(NOW + 3600e3).toISOString(), cards: 6, flipsLeft: 2 },
  featuredSets: [{ key: "gece-limani", name: { tr: "Gece Limanı" }, palette: set.palette, sum: 4600, setPrice: 3450, yourPrice: 2870, owned: 2, total: 8 }],
  yesterday: [{ item: it("y", "voice_tile", 560, "Yosun Kutusu") }],
});
const night = L.normalizeNightMarket({
  open: true, night: { startsAt: new Date(NOW - 3600e3).toISOString(), endsAt: new Date(NOW + 3600e3).toISOString() }, flips: { total: 3, left: 2 }, keepMax: 2,
  cards: [{ index: 0, hint: "banner" }, { index: 1, flipped: true, item: it("n", "banner", 540, "Ay Tozu"), listPrice: 540, price: 297, discountPct: 45, lowest30d: 432 }],
  log: [{ at: new Date(NOW).toISOString(), cardIndex: 1, kind: "flip" }],
});
const noop = () => {};
const actions = new Proxy({}, { get: () => async () => null });
const inventory = [
  ...set.pieces.filter((p) => p.owned).map((p) => ({ itemId: p.item.id, item: p.item })),
  { itemId: "old1", item: { id: "old1", sku: "banner-aurora", category: "banner", name: "Aurora" } },
];
const ctx = (layout) => ({
  me: { id: "me", username: "deniz.aksoy", displayName: "Deniz Aksoy" },
  balance: 5120,
  layout,
  width: layout === "phone" ? 390 : 1136,
  data: { state: "ready", storefront, sets: [set], setDetails: { "gece-limani": set }, night, gifts: { sent: [L.normalizeGift({ id: "g1", status: "delivered", to: { id: "f", displayName: "Mert" }, items: [storefront.slots[2].item], createdAt: new Date(NOW - 60e3).toISOString(), canRecall: true })], received: [L.normalizeGift({ id: "r1", status: "delivered", from: { displayName: "Ece" }, items: [], hidden: true, createdAt: new Date(NOW - 3600e3).toISOString() })], limits: { dailyLeft: 3 } }, history: L.normalizeHistory({ entries: [{ id: "h1", kind: "purchase", at: new Date(NOW).toISOString(), payload: { items: [storefront.slots[2].item] }, undoable: true, undoUntil: new Date(NOW + 300e3).toISOString() }] }), wishlist: [storefront.slots[0].item], outfits: [{ id: "o1", name: "Hafta içi", items: {} }], prefs: {} },
  actions,
  owned: new Set(inventory.map((r) => r.itemId)),
  inventory,
  equippedIdFor: () => null,
  onEquip: async () => true,
  busyItemId: null,
  itemName: (i) => (i?.name && typeof i.name === "object" ? i.name.tr : String(i?.name || "")),
  itemLabels: (i) => ({ category: i.category, rarity: i.rarity || "common", rarityId: i.rarity || "common" }),
  setName: (s) => (typeof s?.name === "object" ? s.name.tr : s?.key),
  tab: "vitrin",
  setTab: noop,
  openSet: noop,
  openGift: noop,
  openCheckout: noop,
  cart: [{ item: storefront.slots[1].item, price: 260 }],
  addToCart: noop,
  removeFromCart: noop,
  clearCart: noop,
  toast: noop,
  setPalette: noop,
  onEarn: noop,
});
const has = (html, s, msg) => assert.ok(html.includes(s), `${msg || s}: not in output`);

for (const layout of ["desktop", "phone"]) {
  const c = ctx(layout);
  const v = m.render("vitrin", c);
  for (const s of ["s2-cards", "Kuzey Işığı", "Bakır Kıvılcım", "Sis Balonu", "Yankı Halkası", "s2-lock is-on", "s2-banner", "Gece Limanı", "s2-strips"]) has(v, s, `${layout} vitrin ${s}`);
  if (layout === "desktop") {
    has(v, "s2-detail", "live preview panel");
    has(v, "s2-hold", "hold-to-buy in the panel");
    has(v, "s2-log", "action log");
  } else {
    has(v, "s2-sticky", "sticky countdown on the phone");
    has(v, "s2-nightstrip", "night market strip while open");
  }
  const s = m.render("sets", c, { setKey: "gece-limani", onSetKey: noop });
  for (const x of NAMES) has(s, x, `${layout} set piece ${x}`);
  has(s, layout === "desktop" ? "s2-kasa" : "s2-pbar", "kasa / phone bar");
  has(s, "s2-pcard", "the real profile card");
  has(s, "s2-vtile", "voice tile");
  const n = m.render("night", c);
  for (const x of ["s2-ncard", "is-flipped", "Ay Tozu", "s2-nlog"]) has(n, x, `${layout} night ${x}`);
  const g = m.render("gifts", c);
  for (const x of ["s2-gto", "s2-gform", "s2-gprev", "s2-track", "Mert"]) has(g, x, `${layout} gifts ${x}`);
  // "Deliver on their birthday" was removed: delivery is "now" or "at a time", nothing else.
  const deliverySeg = g.match(/role="tablist" aria-label="shop2.gifts.delivery">(.*?)<\/div>/s)?.[1] || "";
  assert.equal((deliverySeg.match(/role="tab"/g) || []).length, 2, `${layout} gifts: two delivery choices`);
  has(deliverySeg, "shop2.gifts.now", `${layout} gifts: now`);
  has(deliverySeg, "shop2.gifts.pickTime", `${layout} gifts: at a time`);
  for (const x of ["shop2.gifts.onBirthday", "shop2.gifts.filter.birthday", "shop2.gifts.bday", "s2-friend-bday"]) assert.ok(!g.includes(x), `${layout} gifts: no birthday ${x}`);
  const inv = m.render("inv", c);
  has(inv, "Aurora", "retired item listed");
  has(inv, "is-retired", "Eski koleksiyon section");
  has(m.render("wish", c), "Kuzey Işığı");
  const co = m.render("checkout", c, { checkout: { kind: "set", setKey: "gece-limani", pieceIds: null }, onClose: noop });
  has(co, "s2-hold", "hold-to-confirm");
  has(co, "Fener Halkası");
  const done = m.render("checkout", c, { checkout: { kind: "set", setKey: "gece-limani", phase: "done", result: { purchaseId: "p1", paid: 2870, balance: 2250, refundableUntil: new Date(NOW + 600e3).toISOString() } }, onClose: noop });
  for (const x of ["s2-cele", "s2-parts", "s2-cele-slots", "is-glow"]) has(done, x, `${layout} celebration ${x}`);
}
{
  const c = ctx("desktop");
  const look = m.render("look", c, { text: "Bak\nhttps://descall.com/shop/look/set/gece-limani" });
  has(look, "s2-look", "look card");
  has(look, "s2-look-btn", "open in shop button");
  assert.equal(m.render("look", c, { text: "https://descall.com/settings" }), "", "no card without a look link");
  const sh = m.render("share", { ...c, openShare: noop }, { target: { setKey: "gece-limani" }, onClose: noop });
  has(sh, "s2-share", "share sheet");
}
{
  // Item sheet: an owned item shows no "balance after" (equipping is free), the equip button
  // is disabled while that item's equip is in flight; an unowned one shows the balance line.
  const c = ctx("phone");
  const owned = { item: set.pieces[2].item, price: 500, owned: true };
  const d1 = m.render("detail", c, { slot: owned });
  assert.ok(!d1.includes("shop2.detail.balanceAfter"), "owned item: no balance-after row");
  has(d1, "shop2.common.equip", "owned item: equip button");
  const d2 = m.render("detail", { ...c, busyItemId: set.pieces[2].item.id }, { slot: owned });
  assert.match(d2, /<button[^>]*disabled=""[^>]*aria-busy="true"/, "equip button disabled while busy");
  const d3 = m.render("detail", c, { slot: storefront.slots[3] });
  has(d3, "shop2.detail.balanceAfter", "unowned item: balance-after row");
  // Rarity chip matches the card colours: common is grey (it was blue like "Nadir").
  const dc = m.render("detail", { ...c, itemLabels: () => ({ category: "banner", rarity: "Yaygın", rarityId: "common" }) }, { slot: storefront.slots[0] });
  assert.match(dc, /s2-chip is-muted[^"]*">Yaygın/, "common rarity chip is muted");
  // A stale sheet snapshot (old price 999) reads today's storefront price (620): 5120 -> 4500.
  const d4 = m.render("detail", c, { slot: { ...storefront.slots[3], price: 999 } });
  assert.ok(d4.includes("4.500") && !d4.includes("4.121"), "item sheet uses the live storefront price");
  // Set panel: a complete set offers no 0 D purchase; a set you cannot afford says how much is missing.
  const full = { ...set, pieces: set.pieces.map((p) => ({ ...p, owned: true })), yourPrice: 0 };
  const q1 = m.render("setq", { ...c, data: { ...c.data, setDetails: { "gece-limani": full } } }, { setKey: "gece-limani" });
  has(q1, "shop2.kasa.complete", "complete set: done state");
  assert.ok(!q1.includes("shop2.buy.buyN"), "complete set: no buy button");
  const q2 = m.render("setq", { ...c, balance: 100 }, { setKey: "gece-limani" });
  has(q2, "s2-short", "set panel: short-by when unaffordable");
  const q3 = m.render("setq", c, { setKey: "gece-limani" });
  has(q3, "shop2.buy.buyN", "set panel: buy button when affordable");
  // 4 suggested pieces p0 p1 p4 p5 = 2100 D singles; the whole set (2870 D) is 770 D more.
  assert.match(q3, /shop2\.buy\.chosenSub/, "set panel: whole-set hint");
  // Search with nothing to list renders the empty line.
  const sr = m.render("search", { ...c, data: { ...c.data, storefront: null, sets: [], wishlist: [] } }, { onClose: noop });
  has(sr, "s2-results-empty", "search: empty line");
  // Stage: the chosen voice channel stays in the list when it is not among the first 5.
  const chans = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, name: `k${i}`, type: i === 7 ? "voice" : "text" }));
  assert.deepEqual(m.firstChannels(chans, chans[7]).map((x) => x.id), ["c0", "c1", "c2", "c3", "c4", "c7"], "stage keeps the voice channel");
  assert.equal(m.firstChannels(chans, chans[1]).length, 5, "stage: voice already listed");
}
{
  // Aura / call overlay thumbnails of Market 2.0 items ({ tr, en } names) draw the name's first
  // letter, not "[" from "[object Object]".
  for (const cat of ["profile_aura", "call_overlay"]) {
    const th = m.render("thumb", ctx("desktop"), { item: it("x", cat, 300, "Kutup Işığı", { effect_key: "k" }) });
    assert.ok(/>K</.test(th) && !/>\[</.test(th), `${cat} thumb letter`);
  }
}
const shell = m.renderMarket({ me: { id: "me", username: "d" }, balance: 2940, inventory: [], ownedItemIds: new Set(), allProducts: null });
has(shell, "s2-root", "market shell renders");
has(shell, "s2-tabs", "tab bar");

assert.deepEqual(reactErrors, [], "no React errors");
rmSync(out, { recursive: true, force: true });
console.log("shop2.render.selftest ok");
