// A5 (3.0.0) server hub, sheets, long-press menus and call cards (mockups 01–24, 31, 32).
// Pure helpers are checked directly; every hub page / sheet / menu is rendered with
// react-dom/server for iPhone ("phone") and iPad ("tablet") so a crash, a missing
// string or a wrong copy fails CI. Interactive flows are covered by the logic they call.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../../..");
const out = mkdtempSync(join(tmpdir(), "svh-"));
const J = (p) => JSON.stringify(join(src, p));
const entry = `
import { renderToString } from "react-dom/server";
import { createElement as h } from "react";
import ReactDOM from "react-dom";
ReactDOM.createPortal = (children) => children;
import { ToastProvider } from ${J("context/ToastContext.jsx")};
import { LocaleProvider } from ${J("context/LocaleContext.jsx")};
export * as data from ${J("components/servers/hub/hubData.js")};
export * as strings from ${J("components/servers/hub/strings.js")};
export * as mute from ${J("components/servers/hub/serverMute.js")};
export * as call from ${J("components/voice/CallTapCard.jsx")};
export { ROUTES, sectionOf } from ${J("components/servers/hub/routes.jsx")};
import ServerHub from ${J("components/servers/hub/ServerHub.jsx")};
import * as sheets from ${J("components/servers/hub/sheets.jsx")};
import * as menus from ${J("components/servers/hub/menus.jsx")};
import CallTapCard from ${J("components/voice/CallTapCard.jsx")};
const C = { ServerHub, CallTapCard, ...sheets, ...menus };
export function render(name, props) {
  return renderToString(h(ToastProvider, null, h(LocaleProvider, null, h(C[name], props))));
}
`;
const file = join(out, "bundle.mjs");
await build({
  stdin: { contents: entry, resolveDir: src, loader: "jsx" },
  bundle: true, platform: "node", format: "esm", outfile: file, jsx: "automatic", logLevel: "silent",
  plugins: [{ name: "vite-query-stubs", setup(b) {
    b.onResolve({ filter: /\?(url|raw|worker|inline|worker&url)$/ }, (args) => ({ path: args.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default 'stub';", loader: "js" }));
  } }],
  loader: { ".css": "empty", ".png": "empty", ".svg": "empty", ".mp3": "empty", ".webp": "empty", ".gif": "empty", ".woff2": "empty", ".wasm": "empty" },
  define: { "import.meta.env": JSON.stringify({ MODE: "test", DEV: false, PROD: true }) },
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});

const store = new Map([["descall_language", "tr"]]);
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.navigator ??= { userAgent: "node", language: "tr-TR", languages: ["tr-TR"] };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.location ??= { hostname: "descall.com", href: "https://descall.com/servers", pathname: "/servers", search: "", hash: "", origin: "https://descall.com", protocol: "https:" };
const events = [];
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.dispatchEvent ??= (e) => { events.push(e?.type); return true; };
globalThis.CustomEvent ??= class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, appendChild() {}, addEventListener() {}, removeEventListener() {}, dataset: {} });
globalThis.document ??= { documentElement: el(), body: el(), head: el(), createElement: el, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, removeEventListener() {}, visibilityState: "visible", hidden: false, cookie: "" };
for (const k of ["HTMLElement", "SVGElement", "HTMLMediaElement", "Element", "Node", "MediaStream", "RTCPeerConnection", "AudioWorkletNode", "Event", "Image", "ResizeObserver", "IntersectionObserver", "MutationObserver", "BroadcastChannel", "AudioContext"]) globalThis[k] ??= class { observe() {} disconnect() {} unobserve() {} addEventListener() {} postMessage() {} close() {} };
globalThis.requestAnimationFrame ??= (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);
globalThis.innerWidth ??= 390; globalThis.innerHeight ??= 844;
const origError = console.error;
const reactErrors = [];
console.error = (...a) => { const m = String(a[0]); if (/useLayoutEffect does nothing on the server/.test(m)) return; reactErrors.push(m); origError(...a); };

const M = await import(pathToFileURL(file).href);
const { data: D, strings: S, mute: MU, call: CT } = M;
let n = 0;
const t = (name, fn) => { fn(); n += 1; };

// ---------- copy ----------
t("TR / EN string tables have the same keys", () => {
  const a = Object.keys(S.SVH_TR).sort(), b = Object.keys(S.SVH_EN).sort();
  assert.deepEqual(a.filter((k) => !b.includes(k)), [], "missing in EN");
  assert.deepEqual(b.filter((k) => !a.includes(k)), [], "missing in TR");
  assert.deepEqual(Object.keys(CT.CALL_TAP_STR.tr).sort(), Object.keys(CT.CALL_TAP_STR.en).sort());
});
t("no retired features in the copy (DimaAI, call recording, Valorant/LFG)", () => {
  const all = JSON.stringify([S.SVH_TR, S.SVH_EN, CT.CALL_TAP_STR]);
  for (const bad of [/dima/i, /valorant/i, /\bLFG\b/, /kayd[ıi] ba[şs]lat|aramay[ıi] kaydet|call recording|record(ing)? the call/i]) assert.ok(!bad.test(all), String(bad));
});
t("Turkish copy addresses the user as 'sen' (no formal -iniz/-ınız imperatives)", () => {
  for (const [k, v] of Object.entries(S.SVH_TR)) assert.ok(!/(iniz|ınız|unuz|ünüz|yiniz|yınız)(\b|$|[ .,!?])/i.test(v), `${k}: ${v}`);
});
t("mockup copy (01, 03, 20, 21, 22, 24)", () => {
  assert.equal(S.SVH_TR.leave, "Sunucudan ayrıl");
  assert.equal(S.SVH_TR.del, "Sunucuyu sil");
  assert.equal(S.SVH_TR.transfer, "Sahipliği devret");
  assert.equal(S.SVH_TR.muteSub, "1 saat · 8 saat · Süresiz");
  assert.equal(S.fmt(S.SVH_TR.delChTitle, { name: "klipler" }), "#klipler silinsin mi?");
});
t("Turkish case suffixes for server names", () => {
  assert.equal(S.trAblative("Müzik Kulübü"), "Müzik Kulübü'nden");
  assert.equal(S.trAblative("Oyun Gecesi"), "Oyun Gecesi'nden");
  assert.equal(S.trAblative("Kod"), "Kod'dan");
  assert.equal(S.trAblative("Kampüs"), "Kampüs'ten");
  assert.equal(S.trDativeName("Oyun Gecesi"), "Oyun Gecesi'ne");
  assert.equal(S.caseHelpers("tr").gen("Demir"), "Demir'in");
  assert.equal(S.caseHelpers("en").gen("Demir"), "Demir's");
});

// ---------- join (02) ----------
t("invite input: links, codes and vanity addresses", () => {
  assert.deepEqual(D.inviteCodeFromInput("descall.com/i/turnuva-arenasi"), { kind: "invite", value: "turnuva-arenasi" });
  assert.deepEqual(D.inviteCodeFromInput("https://descall.com/servers/join/K7QM2XRD"), { kind: "invite", value: "K7QM2XRD" });
  assert.deepEqual(D.inviteCodeFromInput("  K7QM2XRD "), { kind: "invite", value: "K7QM2XRD" });
  assert.deepEqual(D.inviteCodeFromInput("descall.com/s/oyungecesi"), { kind: "vanity", value: "oyungecesi" });
  assert.deepEqual(D.inviteCodeFromInput("oyungecesi"), { kind: "either", value: "oyungecesi" });
  assert.deepEqual(D.inviteCodeFromInput(""), { kind: null, value: "" });
  assert.deepEqual(D.inviteCodeFromInput("bu bir link değil!"), { kind: null, value: "" });
  assert.ok(D.vanityValid("oyun-gecesi") && !D.vanityValid("-x") && !D.vanityValid("Büyük"));
});
// ---------- delete with name confirmation (21) ----------
t("delete confirmation matches the backend rule (trim, collapse spaces, lowercase)", () => {
  assert.ok(D.confirmNameMatches("Oyun Gecesi", "Oyun Gecesi"));
  assert.ok(D.confirmNameMatches("  oyun   gecesi ", "Oyun Gecesi"));
  assert.ok(!D.confirmNameMatches("Oyun Geces", "Oyun Gecesi"));
  assert.ok(!D.confirmNameMatches("", ""));
});
// ---------- channel CRUD (06–09) ----------
t("channel names and labels", () => {
  assert.equal(D.normalizeChannelName("Turnuva  Sohbet", "text"), "turnuva-sohbet");
  assert.equal(D.normalizeChannelName("İzmir Lobi", "text"), "izmir-lobi");
  assert.equal(D.normalizeChannelName("Büyük  Lobi", "voice"), "Büyük Lobi");
  assert.equal(D.channelLabel({ name: "genel", type: "text" }), "# genel");
  assert.equal(D.channelLabel({ name: "Lobi", type: "voice" }), "Lobi");
  assert.ok(D.isVoiceLike({ type: "voice" }) && !D.isVoiceLike({ type: "text" }));
  assert.equal(D.countServerChannels({ channels: [{ type: "text" }, { type: "category" }, { type: "voice" }] }), 2);
});
// ---------- permissions tri-state (10) ----------
t("permission overrides: inherit / allow / deny", () => {
  const o = { allow: { SEND_MESSAGES: true }, deny: { VIEW_CHANNEL: true, ATTACH_FILES: false } };
  assert.equal(D.triState(o, "SEND_MESSAGES"), "allow");
  assert.equal(D.triState(o, "VIEW_CHANNEL"), "deny");
  assert.equal(D.triState(o, "ATTACH_FILES"), "inherit");
  assert.equal(D.triState(null, "X"), "inherit");
  assert.equal(D.overrideChangedCount(o), 2);
  assert.deepEqual(D.draftToOverride({ A: "allow", B: "deny", C: "inherit" }), { A: "allow", B: "deny" });
  assert.ok(D.channelIsPrivate([{ targetType: "role", targetId: "e", deny: { VIEW_CHANNEL: true } }], "e"));
  assert.ok(!D.channelIsPrivate([{ targetType: "member", targetId: "e", deny: { VIEW_CHANNEL: true } }], "e"));
  assert.deepEqual(D.orderKeys(["SPEAK", "VIEW_CHANNEL", "ZZZ"], D.CHANNEL_PERM_ORDER), ["VIEW_CHANNEL", "SPEAK", "ZZZ"]);
  assert.ok(D.EVERYONE_LOCKED_KEYS.has("ADMINISTRATOR"));
});
// ---------- roles + members (11–13) ----------
t("role colours and member sorting", () => {
  assert.equal(D.colorToHex(0xff6b6b).toLowerCase(), "#ff6b6b");
  assert.equal(D.hexToColor("#5b8cff"), 0x5b8cff);
  const ms = D.sortMembers([{ username: "zeynep" }, { username: "ayse", displayName: "Ayşe" }, { username: "can" }]);
  assert.deepEqual(ms.map(D.memberName), ["Ayşe", "can", "zeynep"]);
});
// ---------- invites (15) ----------
t("invite activity", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  assert.ok(D.inviteActive({ uses: 3, maxUses: 10, expiresAt: "2026-11-01T00:00:00Z" }, now));
  assert.ok(!D.inviteActive({ uses: 10, maxUses: 10 }, now));
  assert.ok(!D.inviteActive({ expiresAt: "2026-10-01T00:00:00Z" }, now));
});
// ---------- timed server mute (19, 24) ----------
t("server mute: 1 hour, forever, expiry, restore level", () => {
  const now = 1_000_000;
  MU.setServerMute("s1", { durationMs: MU.MUTE_DURATIONS.h1, prevLevel: "mentions", now });
  assert.ok(MU.isServerMuted("s1", now + 1000));
  assert.ok(!MU.isServerMuted("s1", now + 3600_001));
  assert.deepEqual(MU.expiredServerMutes(now + 3600_001), [{ serverId: "s1", prevLevel: "mentions" }]);
  MU.setServerMute("s1", { durationMs: null, prevLevel: "muted", now });
  assert.equal(MU.getServerMute("s1", now + 1e12).prevLevel, "mentions", "re-mute keeps the first level");
  assert.equal(MU.clearServerMute("s1").prevLevel, "mentions");
  assert.ok(!MU.isServerMuted("s1", now));
  assert.equal(MU.MUTE_DURATIONS.h8, 8 * 3600_000);
});
// ---------- call cards (31, 32) ----------
t("call card helpers", () => {
  const tr = CT.CALL_TAP_STR.tr;
  assert.equal(CT.formatClock(0), "00:00");
  assert.equal(CT.formatClock(754), "12:34");
  assert.equal(CT.formatClock(3725), "1:02:05");
  assert.equal(CT.joinNames(["Mert"], tr), "Mert");
  assert.equal(CT.joinNames(["Mert", "Ayşe"], tr), "Mert ve Ayşe");
  assert.equal(CT.joinNames(["Mert", "Ayşe", "Zeynep"], tr), "Mert, Ayşe ve Zeynep");
  assert.equal(CT.joinNames(["Mert", "Ayşe", "Zeynep", "Can"], tr), "Mert, Ayşe ve 2 kişi daha");
  assert.equal(CT.endReasonText({ reason: "remote", peerName: "Ayşe", duration: 60 }, tr), "Bağlantı kesildi (Ayşe ayrıldı)");
  assert.equal(CT.endReasonText({ reason: "local", duration: 60 }, tr), "Aramayı sen bitirdin");
  assert.equal(CT.endReasonText({ reason: "missed", peerId: "u" }, tr), "Sen açmadan arama bitti");
  assert.equal(CT.endReasonText({ groupId: "g", reason: "group" }, tr), "Grup araması bitti");
});

// ---------- renders ----------
const ME = { id: "u1", username: "demir", displayName: "Demir" };
const ROLES = [
  { id: "r0", name: "@everyone", isEveryone: true, position: 0, permissions: "1049600", color: 0 },
  { id: "r1", name: "Yönetici", position: 3, permissions: "8", color: 0xff6b6b, memberCount: 2 },
  { id: "r2", name: "Moderatör", position: 2, permissions: "1099780074566", color: 0x5b8cff, memberCount: 3 },
];
const CH = [
  { id: "cat1", name: "Metin Kanalları", type: "category", position: 0 },
  { id: "c1", name: "genel", type: "text", parentId: "cat1", position: 0, topic: "Oyun Gecesi'ne hoş geldin!" },
  { id: "c2", name: "klipler", type: "text", parentId: "cat1", position: 1 },
  { id: "c3", name: "Lobi", type: "voice", position: 2 },
];
const server = (extra = {}) => ({ id: "s1", name: "Oyun Gecesi", isOwner: true, ownerId: "u1", memberCount: 128, channels: CH, roles: ROLES, permissionsLoaded: true,
  myPermissions: { bits: "8", flags: { ADMINISTRATOR: true }, isOwner: true, highestPosition: 99 }, createdAt: "2026-04-18T10:00:00Z", rulesText: "1. Saygılı ol.\n2. Spam yok.", communityEnabled: true, ...extra });
const deps = { me: ME, friends: [], onlineUsers: {}, serverFolders: [], voiceCount: 4 };
const unent = (s) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/<!-- -->/g, "");
const has = (html, ...needles) => { const h = unent(html); for (const x of needles) assert.ok(h.includes(x), `missing "${x}"`); };
const R = (name, props) => { const before = reactErrors.length; const html = M.render(name, props); assert.equal(reactErrors.length, before, `React error while rendering ${name}`); return html; };

const routes = [
  [{ id: "root" }, ["Oyun Gecesi", "Genel bakış", "Kanallar", "Roller", "Sunucudan ayrıl", "Sunucuyu sil"]],
  [{ id: "ov" }, ["Genel bakış"]],
  [{ id: "ch" }, ["Kanal oluştur", "Kategori oluştur", "# genel", "# klipler"]],
  [{ id: "chCreate" }, ["Kanal türü", "Metin", "Duyuru", "Ses"]],
  [{ id: "catCreate", standalone: true, cancel: true }, ["Kategori adı", "Özel kategori"]],
  [{ id: "chEdit", channelId: "c1" }, ["Kanalı sil"]],
  [{ id: "access", channelId: "c1" }, []],
  [{ id: "perm", channelId: "c1", targetType: "role", targetId: "r2" }, []],
  [{ id: "rl" }, ["Moderatör", "@everyone"]],
  [{ id: "role", roleId: "r2" }, ["Moderatör"]],
  [{ id: "roleMembers", roleId: "r2" }, []],
  [{ id: "mb" }, []],
  [{ id: "iv" }, []],
  [{ id: "cm" }, ["Topluluk"]],
  [{ id: "ru" }, ["Saygılı ol."]],
  [{ id: "mod" }, ["Moderasyon"]],
  [{ id: "nt" }, ["Tüm mesajlar", "Hiçbiri"]],
  [{ id: "tr" }, ["Sahipliği devret"]],
  [{ id: "search" }, []],
];
t("every hub page renders on iPhone and iPad", () => {
  for (const mode of ["phone", "tablet"]) for (const [r, needles] of routes) {
    const initial = mode === "phone" && r.id !== "root" && !r.standalone ? [{ id: "root" }, r] : [r];
    const html = R("ServerHub", { server: server(), mode, initial, onClose() {}, deps });
    try { has(html, ...needles); } catch (e) { e.message = `${mode} ${r.id}: ${e.message}`; throw e; }
  }
});
t("hub respects permissions: a plain member sees no admin rows", () => {
  const sv = server({ isOwner: false, ownerId: "u9", myPermissions: { bits: "0", flags: {}, isOwner: false, highestPosition: 0 } });
  const html = R("ServerHub", { server: sv, mode: "phone", initial: [{ id: "root" }], onClose() {}, deps });
  has(html, "Sunucudan ayrıl");
  assert.ok(!html.includes("Sunucuyu sil"), "non-owner must not see delete");
  assert.ok(!html.includes("Denetim kaydı"), "no audit log without VIEW_AUDIT_LOG");
});
t("create / join / rules / leave / delete / owner-leave sheets", () => {
  for (const mode of ["phone", "tablet"]) {
    has(R("CreateServerSheet", { mode, me: ME, ownedCount: 3, maxOwned: 10, onClose() {}, onCreate() {}, onOpenJoin() {} }),
      "Sunucu oluştur", "Oyun ekibi", "Arkadaş grubu", "Okul ve kulüp", "Topluluk", "Sıfırdan oluştur", "Sunucuya katıl", "3 / 10");
    has(R("JoinServerSheet", { mode, initialCode: "descall.com/i/turnuva-arenasi", onClose() {}, onJoined() {} }), "Sunucuya katıl");
    has(R("RulesGateSheet", { mode, server: server({ name: "Müzik Kulübü" }), onAccepted() {}, onClose() {} }), "Saygılı ol.");
    const del = R("DeleteServerSheet", { mode, server: server(), onCancel() {}, onConfirm() {}, onTransfer() {} });
    has(del, "Oyun Gecesi silinsin mi?", "Onaylamak için sunucu adını yaz", "Sunucuyu kalıcı olarak sil", "Önce sahipliği devret");
    assert.match(del, /<button[^>]*disabled[^>]*>[^<]*Sunucuyu kalıcı olarak sil|disabled=""[^>]*>Sunucuyu kalıcı/, "delete stays disabled until the name matches");
  }
  has(R("LeaveAlert", { server: server({ name: "Müzik Kulübü" }), onCancel() {}, onConfirm() {} }), "Müzik Kulübü'nden ayrılmak istiyor musun?", "Vazgeç", "Ayrıl");
  has(R("OwnerLeaveSheet", { server: server(), onCancel() {}, onTransfer() {}, onDelete() {} }), "Oyun Gecesi'nin sahibisin", "Önce sahipliği devret", "Sunucuyu sil ve ayrıl", "Vazgeç");
});
t("long-press menus (23, 24) and the voice member menu (14)", () => {
  const rect = { x: 16, y: 120, width: 358, height: 64 };
  const sm = R("ServerLongPressMenu", { rect, server: server(), unread: 3, online: 23, folders: [{ id: "f1", name: "Okul & Hobi" }], canInvite: true, onClose() {} });
  has(sm, "Okundu olarak işaretle", "Sessize al", "1 saat · 8 saat · Süresiz", "Bildirimler", "İnsanları davet et", "Klasöre taşı", "Sunucu ayarları", "Sunucudan ayrıl");
  const fm = R("FolderLongPressMenu", { rect, folder: { id: "f1", name: "Okul & Hobi" }, count: 2, allMuted: false, anyUnread: true, onClose() {} });
  has(fm, "Yeniden adlandır", "Klasör rengi", "Tümünü okundu say", "Tümünü sessize al", "Klasörü dağıt", "Sunucular klasörsüz kalır", "Klasörü sil");
  for (const mode of ["phone", "tablet"]) {
    const vm = R("VoiceMemberMenu", { mode, menu: { user: { id: "u4", username: "zeynep", displayName: "Zeynep", muted: true }, channelId: "c3", x: 100, y: 300 },
      presence: "idle", channels: CH.filter((c) => c.type === "voice"), canMute: true, canDeafen: true, canMove: true, volume: 124, onVolume() {}, onClose() {} });
    has(vm, "Zeynep", "%124");
  }
});
t("call cards render (31 join, 32 ended)", () => {
  const join = R("CallTapCard", { card: { kind: "group-join", groupId: "g1", groupName: "Oyun Ekibi", callType: "voice", startTime: Date.now() - 754_000,
    participants: [{ id: "a", username: "mert", displayName: "Mert" }, { id: "b", username: "ayse", displayName: "Ayşe" }], micOn: true }, onJoin() {}, onClose() {} });
  has(join, "Grup araması sürüyor", "Oyun Ekibi", "Mert ve Ayşe konuşuyor", "Mikrofon açık", "Kamera kapalı", "Aramaya katıl", "Şimdi değil");
  const ended = R("CallTapCard", { card: { kind: "ended", peerId: "a", peerName: "Ayşe", callType: "voice", duration: 754, endedAt: Date.parse("2026-10-26T18:42:00Z"), reason: "remote" },
    onCallBack() {}, onMessage() {}, onClose() {} });
  has(ended, "Ayşe", "Arama sona erdi", "12:34", "Sesli arama", "Bağlantı kesildi (Ayşe ayrıldı)", "Geri ara", "Mesaj", "Kapat");
});
t("hub section highlighting ignores routes opened without a selection", () => {
  assert.equal(M.sectionOf([{ id: "ov", nosel: true }], { id: "ov", nosel: true }), null);
  assert.equal(M.sectionOf([{ id: "ov" }, { id: "chEdit", channelId: "c1" }], { id: "chEdit" }), "ch");
});

console.log(`serverHub.selftest: ${n} checks passed`);
