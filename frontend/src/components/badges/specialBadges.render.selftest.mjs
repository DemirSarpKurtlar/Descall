// Special badges (2026-10-26): client store rules + server-render of the profile row, the
// vault (own / someone else's / empty), the settings tab and the admin tab. Bundled with
// esbuild against a fake API module, rendered with react-dom/server. Never hits a network.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../..");
const out = mkdtempSync(join(tmpdir(), "sbr-"));
const entry = `
import { renderToString } from "react-dom/server";
import { createElement as h } from "react";
import ReactDOM from "react-dom";
ReactDOM.createPortal = (children) => children;
import { LocaleProvider } from ${JSON.stringify(join(src, "context/LocaleContext.jsx"))};
import { loadI18nCatalogs } from ${JSON.stringify(join(src, "i18n/index.js"))};
import * as store from ${JSON.stringify(join(src, "lib/specialBadges.js"))};
import { ProfileBadgeRow, BadgeVault, possessiveTr } from ${JSON.stringify(join(here, "BadgeVault.jsx"))};
import BadgeSettingsTab from ${JSON.stringify(join(here, "BadgeSettingsTab.jsx"))};
import SpecialBadgesAdminTab from ${JSON.stringify(join(here, "SpecialBadgesAdminTab.jsx"))};
import { promoLockReason, registerSpecialPromoBadges } from ${JSON.stringify(join(here, "promoBridge.jsx"))};
import { describePromoBadge } from ${JSON.stringify(join(src, "lib/promoBadges.js"))};
import { ART_BY_ID, BADGE_ART } from ${JSON.stringify(join(here, "specialBadgeArt.jsx"))};
export { store, possessiveTr, promoLockReason, registerSpecialPromoBadges, describePromoBadge, ART_BY_ID, BADGE_ART, loadI18nCatalogs };
const wrap = (el, lang) => h(LocaleProvider, { meLanguage: lang || "tr" }, el);
export const render = {
  row: (props, lang) => renderToString(wrap(h(ProfileBadgeRow, props), lang)),
  vault: (props, lang) => renderToString(wrap(h(BadgeVault, props), lang)),
  settings: (props, lang) => renderToString(wrap(h(BadgeSettingsTab, props), lang)),
  admin: (props, lang) => renderToString(wrap(h(SpecialBadgesAdminTab, props), lang)),
};
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
    name: "fake-api",
    setup(b) {
      b.onResolve({ filter: /\?(url|raw|worker|inline|worker&url)$/ }, (args) => ({ path: args.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default 'stub';", loader: "js" }));
      b.onResolve({ filter: /api\/specialBadges(\.js)?$/ }, () => ({ path: "fake-sb-api", namespace: "fakeapi" }));
      b.onLoad({ filter: /.*/, namespace: "fakeapi" }, () => ({
        loader: "js",
        contents: `
          const api = (name) => (...a) => globalThis.__sbApi[name](...a);
          export const getSpecialBadgeCatalog = api("catalog");
          export const getUserSpecialBadges = api("user");
          export const setEquippedSpecialBadge = api("equip");
          export const adminSpecialBadgesOverview = api("overview");
          export const adminSpecialBadgeHolders = api("holders");
          export const adminSpecialBadgeAudit = api("audit");
          export const adminGrantSpecialBadge = api("grant");
          export const adminRevokeSpecialBadge = api("revoke");
          export const adminSearchPeople = api("people");`,
      }));
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
globalThis.requestAnimationFrame ??= (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);
const origError = console.error;
console.error = (...a) => { if (/useLayoutEffect does nothing on the server/.test(String(a[0]))) return; origError(...a); };


const text = (html) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const has = (html, re, msg) => { if (!re.test(html)) assert.fail(`${msg || re}: not found in ${text(html).slice(0, 600)}`); };
const hasNot = (html, re, msg) => { if (re.test(html)) assert.fail(`${msg || re}: unexpectedly found`); };
const m = await import(pathToFileURL(file).href);
const { store, render } = m;
await m.loadI18nCatalogs?.();

const ME = "11111111-1111-4111-8111-111111111111";
const MERT = "22222222-2222-4222-8222-222222222222";
const NOBODY = "33333333-3333-4333-8333-333333333333";
const at = (d) => `2026-10-${d}T10:00:00.000Z`;
const users = {
  [ME]: { equipped: "kurucu", badges: [
    { id: "kurucu", serial: 1, grantedAt: at("01"), via: "admin", grantedBy: null, equipped: true },
    { id: "facebook", serial: 1, grantedAt: at("26"), via: "admin", grantedBy: null, equipped: false },
    { id: "beta", serial: 12, grantedAt: at("10"), via: "promo", grantedBy: null, equipped: false },
  ] },
  [MERT]: { equipped: "facebook", badges: [
    { id: "facebook", serial: 2, grantedAt: at("26"), via: "admin", grantedBy: { id: ME, username: "demir" }, equipped: true },
    { id: "ekim29", serial: 40, grantedAt: at("20"), via: "promo", grantedBy: null, equipped: false },
  ] },
  [NOBODY]: { equipped: null, badges: [] },
};
const catalogRows = m.BADGE_ART.map((b, i) => ({ id: b.id, no: i + 1, name: b.id, tier: b.tier, description: "", holders: b.id === "facebook" ? 2 : b.id === "kurucu" ? 2 : 50 + i, maxHolders: b.tier === "tekil" ? 1 : null }));
let failEquip = false;
const calls = [];
globalThis.__sbApi = {
  catalog: async () => ({ badges: catalogRows }),
  user: async (id) => structuredClone(users[id] || { equipped: null, badges: [] }),
  equip: async (badgeId) => { calls.push(["equip", badgeId]); if (failEquip) throw new Error("not_owned"); return { ok: true, equipped: badgeId }; },
  overview: async () => ({ kpis: { catalog: 36, granted: 3, equipped: 2, activeCodes: 0 }, badges: catalogRows.map((r) => ({ ...r, grantMode: r.id === "facebook" ? "admin_only" : "promo", active: true })) }),
  holders: async () => ({ holders: [] }),
  audit: async () => ({ entries: [] }),
  grant: async () => ({ ok: true, serial: 3 }),
  revoke: async () => ({ ok: true }),
  people: async () => ({ users: [] }),
};

// ---- catalog shape
assert.equal(m.BADGE_ART.length, 36, "36 badges");
assert.equal(m.ART_BY_ID.facebook.tier, "nadir", "Facebook is Nadir");
assert.equal(store.BADGE_TOTAL, 36);
assert.equal(store.formatSerial(1), "#001");
assert.equal(store.formatSerial(42), "#042");
assert.equal(store.formatSerial(1234), "#1234");

await store.loadCatalog();
for (const id of [ME, MERT, NOBODY]) await store.loadUserBadges(id);

// ---- sorting: tier first, then fewer holders first; "new" by date; "name" alphabetical
const nameOf = (id) => id;
assert.deepEqual(store.sortOwned(users[ME].badges, "tier", nameOf).map((b) => b.id), ["kurucu", "facebook", "beta"], "efsanevi before nadir; fewer holders first");
assert.deepEqual(store.sortOwned(users[ME].badges, "new", nameOf).map((b) => b.id), ["facebook", "beta", "kurucu"]);
assert.deepEqual(store.sortOwned(users[ME].badges, "name", nameOf).map((b) => b.id), ["beta", "facebook", "kurucu"]);

// ---- live equipped map: null (took it off) beats a stale user object; undefined is ignored
const stale = { id: MERT, equippedSpecialBadge: { id: "facebook", serial: 2 } };
assert.equal(store.equippedFor(stale).id, "facebook");
store.noteEquipped(MERT, undefined);
assert.equal(store.equippedFor(stale).id, "facebook", "payload without the key changes nothing");
store.noteEquipped(MERT, null);
assert.equal(store.equippedFor(stale), null, "unequip wins over stale profile");
assert.equal(store.userBadgesState(MERT).data.equipped, null);
store.noteEquipped(MERT, { id: "facebook", serial: 2 });
store.noteEquipped(MERT, { id: "not-a-badge", serial: 1 });
assert.equal(store.equippedFor(stale), null, "unknown ids are dropped");
store.noteEquipped(MERT, { id: "facebook", serial: 2 });

// ---- equip: optimistic, reverts on failure
await store.equipMine(ME, "facebook");
assert.equal(store.equippedFor({ id: ME }).id, "facebook");
assert.equal(store.userBadgesState(ME).data.badges.find((b) => b.id === "facebook").equipped, true);
failEquip = true;
await assert.rejects(() => store.equipMine(ME, "beta"));
assert.equal(store.equippedFor({ id: ME }).id, "facebook", "reverted after failure");
failEquip = false;
await store.equipMine(ME, "kurucu");
assert.deepEqual(calls.map((c) => c[1]), ["facebook", "beta", "kurucu"]);

// ---- Turkish possessive for the vault title
assert.equal(m.possessiveTr("Mert"), "Mert'in");
assert.equal(m.possessiveTr("Ayşe"), "Ayşe'nin");
assert.equal(m.possessiveTr("Oğuz"), "Oğuz'un");
assert.equal(m.possessiveTr("Gül"), "Gül'ün");
assert.equal(m.possessiveTr("Demir"), "Demir'in");

// ---- promo bridge
assert.equal(m.promoLockReason({ grantMode: "admin_only" }), "adminOnly", "Facebook never goes on a code");
assert.equal(m.promoLockReason({ grantMode: "promo", maxHolders: 1, holders: 1 }), "taken", "held #001 is locked");
assert.equal(m.promoLockReason({ grantMode: "promo", maxHolders: 1, holders: 0 }), null);
assert.equal(m.promoLockReason({ grantMode: "promo", active: false }), "inactive");
m.registerSpecialPromoBadges("tr");
assert.equal(m.describePromoBadge("facebook").name, "Facebook");
assert.equal(m.describePromoBadge("facebook").tierLabel, "Nadir");
assert.equal(m.describePromoBadge("demironayli").name, "Admin Onaylı");

// ---- profile row
const me = { id: ME, username: "demir", displayName: "Demir", equippedCountry: { id: "country-tr", code: "TR" } };
const mert = { id: MERT, username: "mert", displayName: "Mert", equippedCountry: { id: "country-tr", code: "TR" }, equippedSpecialBadge: { id: "facebook", serial: 2 } };
const nobody = { id: NOBODY, username: "ali", displayName: "Ali" };
let html = render.row({ user: mert, me });
has(html, /bp-plus/, "+ on someone with badges");
has(html, /sb-chip-fb/, "Facebook chip keeps its blue");
has(html, /aria-haspopup="dialog"/);
has(html, /Tüm rozetler, 2 rozet/, "+ says how many");
html = render.row({ user: nobody, me });
hasNot(html, /bp-plus/, "no + on someone with no badges");
html = render.row({ user: { id: NOBODY, username: "ali" }, me: { id: NOBODY } });
has(html, /bp-plus/, "own profile always shows + (empty state)");

// ---- vault: own
html = render.vault({ user: me, me, self: true, variant: "desk", onClose() {} });
has(html, /Rozetlerin/);
has(text(html), /36 rozetten 3 tanesi sende/);
has(html, /role="dialog"/);
has(html, /aria-modal="true"/);
has(html, /✓|Takılı/);
assert.equal((html.match(/<button type="button" class="bp-tile[ "]/g) || []).length, 3, "only owned badges, no locked ones");
has(html, /#001/);

// own phone sheet: bottom bar + grabber
html = render.vault({ user: me, me, self: true, variant: "sheet", onClose() {} });
has(html, /bp-pop is-sheet/);
has(html, /bp-grabber/);
has(html, /bp-sheet-bar/);

// ---- vault: someone else's, read-only
html = render.vault({ user: mert, me, self: false, variant: "desk", onClose() {} });
has(text(html), /Mert'in rozetleri/);
has(html, /tanesi onda/);
hasNot(html, />Tak</, "no wear button on someone else's");
has(html, /Takıyor/);
has(text(html), /Sende de var · #001/, "shared badge shows your number");
has(html, /Demir|Sen verdin/);

// ---- vault: empty (own) with the code button
html = render.vault({ user: { id: NOBODY, username: "ali" }, me: { id: NOBODY }, self: true, variant: "desk", onClose() {} });
has(html, /Henüz özel rozetin yok/);
has(html, /Kod kullan/);

// ---- English
html = render.vault({ user: mert, me, self: false, variant: "desk", onClose() {} }, "en");
has(text(html), /Mert's badges/);

// ---- settings + admin render without throwing
html = render.settings({ me });
has(html, /İsminin yanında/);
has(html, /Yalnızca ülke rozeti/);
has(html, /bs-card selected/);
html = render.admin({ me });
has(html, /mt-kpi/);

console.log("specialBadges.render.selftest ok");
