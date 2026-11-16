// End-of-call DesCoin summary (draft C + B receipt rows): server-render of the popup on
// desktop and as the phone sheet (Turkish and English), the server channel case, the case
// without a featured item, the wallet history drawer at a receipt and Settings › Cüzdan ve
// kazanç. Bundled with esbuild against a fake shop API, rendered with react-dom/server.
// Run: node src/components/descoin/callCoinSummary.render.selftest.mjs
import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../..");
const out = mkdtempSync(join(tmpdir(), "ccs-"));
const entry = `
import { renderToString } from "react-dom/server";
import { createElement as h } from "react";
import ReactDOM from "react-dom";
ReactDOM.createPortal = (children) => children;
import { LocaleProvider } from ${JSON.stringify(join(src, "context/LocaleContext.jsx"))};
import { loadI18nCatalogs, ensureLocaleLoaded } from ${JSON.stringify(join(src, "i18n/index.js"))};
import CallCoinSummary, { sampleCallCoinSummary } from ${JSON.stringify(join(here, "CallCoinSummary.jsx"))};
import WalletHistoryDrawer from ${JSON.stringify(join(here, "WalletHistoryDrawer.jsx"))};
import WalletSettingsTab from ${JSON.stringify(join(src, "components/settings/WalletSettingsTab.jsx"))};
export { loadI18nCatalogs, ensureLocaleLoaded, sampleCallCoinSummary };
const wrap = (el, lang) => h(LocaleProvider, { meLanguage: lang || "tr" }, el);
export const render = {
  popup: (props, lang) => renderToString(wrap(h(CallCoinSummary, props), lang)),
  drawer: (props, lang) => renderToString(wrap(h(WalletHistoryDrawer, props), lang)),
  settings: (props, lang) => renderToString(wrap(h(WalletSettingsTab, props), lang)),
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
const origError = console.error;
const reactErrors = [];
console.error = (...a) => {
  if (/useLayoutEffect does nothing on the server/.test(String(a[0]))) return;
  reactErrors.push(String(a[0]));
  origError(...a);
};

const text = (html) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const has = (html, s, msg) => { if (!text(html).includes(s) && !html.includes(s)) assert.fail(`${msg || s}: not found in ${text(html).slice(0, 900)}`); };
const hasNot = (html, s, msg) => { if (text(html).includes(s)) assert.fail(`${msg || s}: unexpectedly found`); };

const m = await import(pathToFileURL(file).href);
await m.loadI18nCatalogs?.();
for (const id of ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]) await m.ensureLocaleLoaded(id);
const { render } = m;
const NOW = Date.parse("2026-11-15T21:42:00+03:00");
const tTr = (k, v) => ({ "coinpop.settings.sampleName": "Elif Yıldız", "coinpop.settings.sampleItem": "Aurora Işıltısı" })[k] ?? k;
const sample = m.sampleCallCoinSummary(tTr, { now: NOW });

// ---- desktop popup, Turkish: draft C hero + B rows + balance + streak + warning + item + receipt
{
  const html = render.popup({ summary: sample, variant: "desktop", now: NOW, still: true }, "tr");
  has(html, 'role="dialog"');
  has(html, "is-desk");
  has(html, "Arama bitti · Elif Yıldız");
  has(html, "Doğrudan arama");
  has(html, "Ekran paylaşıldı");
  has(html, "+42");
  has(html, "38 dk 12 sn");
  has(html, "26 dk konuşma");
  has(html, "Bugünkü kazanç");
  has(html, "Bugün önceden 212");
  has(html, "Bu arama 42");
  has(html, "Kalan 146");
  has(html, "Konuşma etkinliği");
  has(html, "26 dakika aktif konuştun");
  has(html, "Ekran paylaşımı");
  has(html, "8 dakika paylaştın");
  has(html, "Önceki bakiye");
  has(html, "1.242");
  has(html, "Yeni bakiye");
  has(html, "1.284");
  has(html, "Arama serisi");
  has(html, "gün üst üste");
  has(html, "Bugünkü konuşma sınırına yakınsın");
  has(html, "172 / 180");
  has(html, "8 DesCoin daha kazanabilirsin");
  has(html, "Öne çıkan");
  has(html, "Son 14 adet");
  has(html, "Aurora Işıltısı");
  has(html, "%25");
  has(html, "05:12:44", "live countdown");
  has(html, "800");
  has(html, "Bakiyen yetiyor");
  has(html, "600 DesCoin'e hemen al");
  has(html, "Mağazada harca");
  has(html, "Fiş DC-7F3A · cüzdan geçmişine kaydedildi");
  has(html, "Özet ayarları");
  has(html, "Bir daha gösterme");
  has(html, 'aria-label="Kapat"');
  has(html, "ccs-perf", "perforated divider");
  hasNot(html, "Cüzdan geçmişi", "B buttons only without a featured item");
}

// ---- phone sheet: compact labels, same order
{
  const html = render.popup({ summary: sample, variant: "sheet", now: NOW, still: true }, "tr");
  has(html, "is-sheet");
  has(html, "ccs-grab");
  has(html, "38 dk 12 sn konuştunuz");
  has(html, "600 DesCoin'e al");
  has(html, "Seri");
  has(html, "Fiş DC-7F3A");
  hasNot(html, "ccs-x", "no close button on the sheet (drag handle + scrim)");
  hasNot(html, "Bakiyen yetiyor");
}

// ---- server channel, no screen share, no warning, no featured item -> B buttons; English
{
  const srv = {
    ...sample,
    context: "server",
    display: { id: "ch-1", name: "Game Night", channelName: "Game Night", serverId: "s-1", serverName: "North Players", avatarUrl: null },
    people: 6,
    screenShared: false,
    earnedScreenshare: 0,
    screenSec: 0,
    earnedVoice: 30,
    earnedTotal: 30,
    durationSec: 4320,
    balance: 1314,
    balanceBefore: 1284,
    nearCap: null,
    hourCapReached: true,
    featuredItem: null,
    streakDays: 1,
  };
  const html = render.popup({ summary: srv, variant: "desktop", now: NOW, still: true }, "en");
  has(html, "North Players · Game Night");
  has(html, "Server channel");
  has(html, "6 people in the channel");
  has(html, "1 h 12 min");
  has(html, "Talking");
  hasNot(html, "Screen shared");
  hasNot(html, "You shared for", "zero rows are hidden");
  has(html, "You hit this hour's limit");
  has(html, "1 day in a row");
  has(html, "Spend in the shop");
  has(html, "Wallet history");
  hasNot(html, "Buy now");
  hasNot(html, "You are close to");
}

// ---- other languages render without missing keys
for (const lang of ["de", "es", "fr", "pt-BR", "ru"]) {
  const html = render.popup({ summary: sample, variant: "desktop", now: NOW, still: true }, lang);
  assert.doesNotMatch(text(html), /coinpop\./, `${lang}: raw key`);
  assert.doesNotMatch(text(html), /Call ended|Spend in the shop/, `${lang}: rendered in its own language`);
}
{
  const html = render.popup({ summary: { ...sample, streakDays: 3 }, variant: "desktop", now: NOW, still: true }, "ru");
  has(html, "Звонок завершён");
  has(html, "дня подряд");
}

// ---- wallet history drawer at a receipt
{
  const entries = [
    { id: 3, amount: -600, reason: "shop_purchase", created_at: "2026-11-15T19:00:00Z", balance_after: 684 },
    { id: 2, amount: 2, reason: "screenshare_activity", meta: { callSession: "S1", receipt: "DC-7F3A", context: "dm" }, created_at: "2026-11-15T18:41:00Z", balance_after: 1284 },
    { id: 1, amount: 1, reason: "voice_activity", meta: { callSession: "S1", receipt: "DC-7F3A", context: "dm" }, created_at: "2026-11-15T18:40:00Z", balance_after: 1282 },
  ];
  const html = render.drawer({ open: true, receipt: "DC-7F3A", entries }, "tr");
  has(html, "Cüzdan geçmişi");
  has(html, "Arama kazancı");
  has(html, "Fiş DC-7F3A");
  has(html, "Konuşma +1 · Ekran paylaşımı +2");
  has(html, "Bu fiş", "the receipt is highlighted");
  has(html, "Mağaza alışverişi");
  has(html, "-600");
  assert.equal(render.drawer({ open: false, entries }, "tr"), "");
}

// ---- settings tab
{
  const html = render.settings({ now: NOW, loadDaily: async () => ({}), loadLedger: async () => ({ entries: [] }) }, "tr");
  has(html, "Cüzdan ve kazanç");
  has(html, "Arama sonu DesCoin özeti");
  has(html, 'role="switch"');
  has(html, "En az şu kadar kazandıysam göster");
  for (const n of ["1", "5", "10", "25", "50"]) has(html, `>${n}<`, `threshold ${n}`);
  has(html, 'aria-checked="true"');
  has(html, "Doğrudan arama");
  has(html, "Sunucu kanalı");
  has(html, "Canlı önizleme");
  has(html, "Örnek özeti oynat");
  has(html, "Bugünkü kazanç sınırları");
  has(html, "Son arama kazançları");
  has(html, "is-desk");
  has(html, "is-sheet");
}

assert.deepEqual(reactErrors, [], "no React errors");
rmSync(out, { recursive: true, force: true });
console.log("callCoinSummary.render.selftest ok");
