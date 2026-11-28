// Friends sidebar invite card, draft B "Kazanç panosu" (28 Nov 2026): server-render of
// InviteBoard with dashboard data in tr and de (live rules, chips, pending, next milestone,
// paused link, unread dot, copied state). Bundled with esbuild, never hits the network.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../..");
const out = mkdtempSync(join(tmpdir(), "ibr-"));
const entry = `
import { renderToString } from "react-dom/server";
import { createElement as h } from "react";
import { LocaleProvider } from ${JSON.stringify(join(src, "context/LocaleContext.jsx"))};
import { loadI18nCatalogs } from ${JSON.stringify(join(src, "i18n/index.js"))};
import InviteBoard from ${JSON.stringify(join(here, "InviteBoard.jsx"))};
export { loadI18nCatalogs };
export const render = (props, lang) => renderToString(h(LocaleProvider, { meLanguage: lang || "tr" }, h(InviteBoard, props)));
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
      b.onResolve({ filter: /api\/invites(\.js)?$/ }, () => ({ path: "fake-invites", namespace: "fakeapi" }));
      b.onLoad({ filter: /.*/, namespace: "fakeapi" }, () => ({ loader: "js", contents: "export const getInviteDashboard = () => Promise.reject(new Error('no network in tests'));" }));
    },
  }],
  loader: { ".css": "empty", ".png": "empty", ".svg": "empty", ".mp3": "empty", ".webp": "empty", ".gif": "empty", ".woff2": "empty" },
  define: { "import.meta.env": JSON.stringify({ MODE: "test", DEV: false, PROD: true }) },
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});

const mem = new Map();
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.navigator ??= { userAgent: "node" };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.location ??= { hostname: "descall.com", href: "https://descall.com/", pathname: "/", search: "", hash: "", origin: "https://descall.com", protocol: "https:" };
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.dispatchEvent ??= () => true;
const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, appendChild() {}, addEventListener() {}, removeEventListener() {}, dataset: {} });
globalThis.document ??= { documentElement: el(), body: el(), head: el(), createElement: el, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, removeEventListener() {}, visibilityState: "visible", hidden: false, cookie: "" };
for (const k of ["CustomEvent", "Event"]) globalThis[k] ??= class {};

const m = await import(pathToFileURL(file).href);
await m.loadI18nCatalogs?.();
const text = (html) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

const data = {
  rules: { inviterReward: 120, inviteeReward: 60 },
  totals: { earned: 360, pending: 120 },
  milestones: { count: 4, next: 5, list: [{ at: 3, reached: true }, { at: 5, reached: false }] },
  wallet: [{ id: "w1" }],
  notices: [{ id: "n1" }],
  paused: false,
};
const base = { url: "https://descall.com/r/admin", copied: false, shareBusy: false, onCopy() {}, onShare() {}, onOpenCenter() {} };

const tr = m.render({ ...base, initialData: data }, "tr");
const trText = text(tr);
assert.match(trText, /Arkadaş davet et/);
assert.match(trText, /Sen \+120, arkadaşın \+60/, "live rules, not the old hard-coded 100 / 50");
assert.match(text(tr), /4 aktif davet 360 kazandığın/, "chips: active invites and earned");
assert.match(trText, /1 bekleyen/);
assert.match(trText, /\+120 yolda/);
assert.match(trText, /Sonraki ödüle 1 davet/);
assert.match(tr, /aria-valuenow="50"/, "4 of 3..5 is half way");
assert.match(tr, /class="ib-host">descall\.com<\/span><span class="ib-path">\/r\/admin</, "host shrinks, the personal path stays");
assert.match(tr, /class="ib-dot"/, "unread notice dot");
assert.match(trText, /Davet Merkezi/);
assert.doesNotMatch(trText, /dvt\.board\./, "no raw keys");

const copied = m.render({ ...base, copied: true, initialData: data }, "tr");
assert.match(copied, /ib-card is-copied/);
assert.match(text(copied), /Link kopyalandı/);

const paused = m.render({ ...base, initialData: { ...data, paused: true } }, "tr");
assert.match(text(paused), /Davet linkin duraklatıldı/);
assert.doesNotMatch(paused, /data-testid="invite-board-copy"/);

const fresh = m.render({ ...base, initialData: { rules: {}, totals: {}, milestones: { count: 0, next: 1, list: [{ at: 1, reached: false }] }, wallet: [] } }, "tr");
assert.match(text(fresh), /İlk daveti gönder/);

for (const lang of ["en", "de", "es", "fr", "pt-BR", "ru"]) {
  const html = m.render({ ...base, initialData: data }, lang);
  assert.doesNotMatch(text(html), /dvt\.board\.|bekleyen|Sonraki ödüle/, `${lang}: translated`);
}
// Every locale has every dvt.board key (the server render above only loads tr and en).
const { INVITES_I18N } = await import(pathToFileURL(join(src, "i18n/locales/invites.i18n.js")).href);
const keys = Object.keys(INVITES_I18N.tr.board);
for (const [lang, pack] of Object.entries(INVITES_I18N)) {
  for (const k of keys) assert.ok(typeof pack.board?.[k] === "string" && pack.board[k].length > 0, `${lang}: dvt.board.${k}`);
}
console.log("inviteBoard.render.selftest: ok");
