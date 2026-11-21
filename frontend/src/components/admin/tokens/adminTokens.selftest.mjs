// Admin Token (admin, owner only, Draft B "Liste ve çalışma alanı"): pure model, locale
// parity in 7 languages, every atok.* key the page uses exists, the panel wiring (owner-only
// tab under Güvenlik, İşlem kaydı links), the API contract paths, opaque dialogs, type scale
// tokens only, no emoji.
//   node src/components/admin/tokens/adminTokens.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as M from "./tokenModel.js";
import { messageArguments } from "../../../i18n/message.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), "utf8");
const NOW = Date.parse("2026-11-21T11:47:06.000Z");
const ago = (s) => new Date(NOW - s * 1000).toISOString();
const ahead = (s) => new Date(NOW + s * 1000).toISOString();

/* ---- identity ---- */
assert.equal(M.statusKey("active"), "atok.status.active");
assert.equal(M.statusKey("revoked"), "atok.status.revoked");
assert.equal(M.statusKey("weird"), "atok.status.expired", "unknown status reads as not working");
assert.equal(M.expiryKey("30d"), "atok.exp.30d");
assert.equal(M.expiryKey("never"), "atok.exp.never");
assert.equal(M.expiryKey("5y"), "atok.exp.never");
assert.deepEqual([...M.EXPIRY_OPTIONS], ["1h", "1d", "7d", "30d", "90d", "never"], "contract expiry options");
assert.equal(M.maskToken({ prefix: "7Hq2", last4: "k9Xa" }), "dsk_admin_7Hq2\u2026k9Xa", "dsk_admin_7Hq2…k9Xa like the draft");
assert.ok(M.maskToken(null).startsWith("dsk_admin_"));
assert.equal(M.maskToken({ masked: "dsk_admin_AbCd\u2026wXyZ", prefix: "x", last4: "y" }), "dsk_admin_AbCd\u2026wXyZ", "the server's masked string wins");
assert.ok(M.autoPaused({ status: "paused", pausedReason: "alert" }) && !M.autoPaused({ status: "paused", pausedReason: "manual" }) && !M.autoPaused({ status: "active", pausedReason: "alert" }));
assert.equal(M.allowIpMode({ ipAllowlist: ["1.2.3.4"] }), "add");
assert.equal(M.allowIpMode({ ipAllowlist: [] }), "approve", "no allowlist: allow_ip approves instead of adding");
assert.equal(M.initials("Claude Code"), "CC");
assert.equal(M.initials("moderasyon asistanı"), "MA");
assert.equal(M.initials("ılık"), "IL", "Turkish dotless i upper-cases to I");
assert.equal(M.initials("  "), "?");
assert.equal(M.tokenColor("tok_a"), M.tokenColor("tok_a"), "stable colour");
assert.ok(M.isLive({ status: "paused" }) && !M.isLive({ status: "expired" }));
const colored = M.assignColors([{ id: "b", createdAt: ago(10) }, { id: "a", createdAt: ago(100) }]);
assert.notEqual(colored[0].color, colored[1].color, "neighbours differ");
assert.equal(M.assignColors([{ id: "a", createdAt: ago(100) }])[0].color, colored[1].color, "oldest keeps its colour");
assert.ok(!colored.some((t) => /f25562/i.test(t.color)), "no token is drawn in the danger red");

/* ---- filter and search ---- */
const TOKS = [
  { id: "1", name: "Claude Code", prefix: "7Hq2", last4: "k9Xa", status: "active", createdAt: ago(900), hasOpenAlert: false },
  { id: "2", name: "Moderasyon asistanı", prefix: "Mx8t", last4: "Qa71", status: "active", createdAt: ago(800), hasOpenAlert: true },
  { id: "3", name: "Duyuru zamanlayıcı", prefix: "An5w", last4: "Hk3P", status: "paused", createdAt: ago(700) },
  { id: "4", name: "Yedekleme betiği", prefix: "Bk2z", last4: "p0Ue", status: "expired", createdAt: ago(600) },
  { id: "5", name: "Eski deneme tokenı", prefix: "Ts9d", last4: "w4Rr", status: "revoked", createdAt: ago(500) },
];
assert.deepEqual(M.filterTokens(TOKS, { filter: "live" }).map((t) => t.id), ["1", "2", "3"], "Çalışan = active + paused");
assert.deepEqual(M.filterTokens(TOKS, { filter: "dead" }).map((t) => t.id), ["4", "5"], "Pasif = expired + revoked");
assert.deepEqual(M.filterTokens(TOKS, { query: "asistani" }).map((t) => t.id), ["2"], "search folds ı");
assert.deepEqual(M.filterTokens(TOKS, { query: "ZAMANLAYICI" }).map((t) => t.id), ["3"]);
assert.deepEqual(M.filterTokens(TOKS, { query: "k9xa" }).map((t) => t.id), ["1"], "search by last 4");
assert.deepEqual(M.filterTokens(TOKS, { filter: "dead", query: "claude" }), []);
assert.deepEqual(M.countByFilter(TOKS), { all: 5, live: 3, dead: 2 });
assert.equal(M.defaultSelection(TOKS), "2", "opens the live token with an open alert first");
assert.equal(M.defaultSelection(TOKS.slice(3)), "4");
assert.equal(M.defaultSelection([]), null);

/* ---- time ---- */
assert.deepEqual(M.agoLabel(ago(13), NOW), { key: "atok.ago.s", vars: { n: 13 } }, "13 sn önce");
assert.equal(M.agoLabel(ago(2), NOW).key, "atok.ago.now");
assert.deepEqual(M.agoLabel(ago(95), NOW), { key: "atok.ago.m", vars: { n: 1 } });
assert.deepEqual(M.agoLabel(ago(10 * 3600 + 50), NOW), { key: "atok.ago.h", vars: { n: 10 } }, "10 sa önce");
assert.deepEqual(M.agoLabel(ago(43 * 86400), NOW), { key: "atok.ago.d", vars: { n: 43 } }, "43 gün önce");
assert.equal(M.agoLabel(null, NOW).key, "atok.ago.never", "Henüz kullanılmadı");
assert.deepEqual(M.leftLabel(ahead(21 * 86400 + 3600), NOW), { key: "atok.left.d", vars: { n: 21 } }, "21 gün kaldı");
assert.deepEqual(M.leftLabel(ahead(17 * 60 + 5), NOW), { key: "atok.left.m", vars: { n: 17 } }, "17 dk kaldı");
assert.deepEqual(M.leftLabel(ahead(30 * 3600), NOW), { key: "atok.left.h", vars: { n: 30 } }, "hours up to 48");
assert.equal(M.leftLabel(ago(5), NOW).key, "atok.left.over");
assert.equal(M.validityLabel({ status: "active", expiresAt: null }, NOW).key, "atok.left.none", "Süresiz: Bitiş yok");
assert.equal(M.validityLabel({ status: "revoked", expiresAt: ahead(99) }, NOW).key, "atok.left.revoked");
assert.equal(M.validityLabel({ status: "expired", expiresAt: ago(99) }, NOW).key, "atok.left.over");
assert.equal(M.expiryEnd("1h", NOW).toISOString(), ahead(3600));
assert.equal(M.expiryEnd("90d", NOW).getTime(), NOW + 90 * 86400e3);
assert.equal(M.expiryEnd("never", NOW), null);
assert.equal(M.restoreLeft({ status: "revoked", restorableUntil: ahead(125) }, NOW), 125);
assert.equal(M.restoreLeft({ status: "revoked", restorableUntil: ago(1) }, NOW), 0);
assert.equal(M.restoreLeft({ status: "active", restorableUntil: ahead(125) }, NOW), 0, "only a revoked token is restorable");
assert.equal(M.clock(125), "2:05");
assert.equal(M.clock(600), "10:00");
const soon = M.expiringSoon([{ id: "k", status: "active", expiresAt: ahead(17 * 60) }, { id: "x", status: "active", expiresAt: ahead(3 * 86400) }, { id: "p", status: "paused", expiresAt: ahead(60) }, { id: "n", status: "active", expiresAt: null }], NOW);
assert.deepEqual(soon.map((t) => t.id), ["k"], "Kredi dağıtım betiği yakında sona eriyor");
assert.ok(M.inGrace({ graceUntil: ahead(60) }, NOW) && !M.inGrace({ graceUntil: null }, NOW));

/* ---- numbers ---- */
assert.equal(M.deltaPct(7746, 5940), 30, "+%30 dünden");
assert.equal(M.deltaPct(10, 0), null);
assert.equal(M.deltaPct(50, 100), -50);
assert.equal(M.pct(0.006), 0.6, "%0,6");
assert.equal(M.pct(0.58, 0), 58);
assert.deepEqual(M.shareSplit(0.58, 0.42), { mcp: 58, rest: 42 });
assert.deepEqual(M.shareSplit(0, 0), { mcp: 0, rest: 0 });
assert.deepEqual(M.shareSplit(1, 2), { mcp: 33, rest: 67 }, "adds up to 100");
assert.equal(M.niceMax([980, 10]), 1000);
assert.equal(M.niceMax([310]), 400);
assert.equal(M.niceMax([]), 10);

/* ---- sparkline and bars ---- */
const sp = M.sparkPaths([0, 5, 10], 100, 30);
assert.equal(sp.line, "M0.0 28.0 L50.0 15.0 L100.0 2.0");
assert.ok(sp.area.endsWith("Z") && sp.area.startsWith(sp.line));
assert.equal(M.sparkPaths([4]).line, "", "one point draws nothing");
assert.equal(M.sparkPaths([0, 0, 0], 100, 16).line, "M0.0 14.0 L50.0 14.0 L100.0 14.0", "no traffic = flat line at the bottom");
const bars = M.hourBars([{ hour: "a", count: 500, destructive: 0 }, { hour: "b", count: 980, destructive: 5 }, { hour: "c", count: 0, destructive: 0 }], 1000);
assert.deepEqual(bars.map((b) => Math.round(b.total)), [50, 98, 0]);
assert.ok(bars[1].dest >= 3 && bars[1].dest <= bars[1].total && Math.abs(bars[1].normal + bars[1].dest - bars[1].total) < 1e-9, "red part sits inside the bar");
assert.equal(bars[0].dest, 0);
const day = M.daySummary([{ hour: "h0", count: 0 }, { hour: "h1", count: 12 }, { hour: "h2", count: 980 }, { hour: "h3", count: 4 }]);
assert.deepEqual([day.peakHour, day.peakCount, day.firstHour, day.perHour], ["h2", 980, "h1", 249]);
assert.equal(M.daySummary([]).peakHour, null);
assert.deepEqual(M.axisTicks(24), [0, 6, 12, 18, 23], "dün 15:00, 21:00, 03:00, 09:00, şimdi");

/* ---- destructive calls ---- */
assert.equal(M.destructiveKind({ method: "POST", path: "/api/admin/users/u_1/ban" }), "ban");
assert.equal(M.destructiveKind({ method: "DELETE", path: "/api/admin/messages/m_1" }), "delete");
assert.equal(M.destructiveKind({ method: "POST", path: "/api/admin/credits/grant" }), "descoin");
assert.equal(M.destructiveKind({ method: "POST", path: "/api/admin/announcements" }), "broadcast");
assert.equal(M.destructiveKind({ method: "MCP", path: "tools/call ban_user" }), "ban");
assert.equal(M.destructiveKind({ via: "mcp", method: "POST", path: "/mcp", tool: "grant_credits" }), "descoin");
assert.equal(M.destructiveKind({ method: "GET", path: "/api/admin/users?q=x" }), null);
assert.equal(M.destructiveKind({ method: "POST", path: "/x", destructiveKind: "broadcast" }), "broadcast", "the server's destructiveKind wins");
assert.equal(M.isDestructiveRow({ method: "GET", path: "/api/admin/announcements" }), false);
assert.equal(M.isDestructiveRow({ method: "POST", path: "/x", destructive: true }), true, "the server's flag wins");
assert.deepEqual(M.destructiveParts({ ban: 12, delete: 9, descoin: 14, broadcast: 2, total: 37 }).map((p) => `${p.kind}:${p.n}`), ["ban:12", "delete:9", "descoin:14", "broadcast:2"]);
assert.deepEqual(M.destructiveParts({ ban: 0, delete: 3 }).map((p) => p.kind), ["delete"]);
assert.deepEqual(M.topTools([{ method: "GET", path: "/x", count: 9 }, { method: "MCP", path: "tools/call ban_user", count: 40 }, { method: "MCP", path: "tools/call search_users", count: 979 }]).map((x) => [x.name, x.destructive]), [["search_users", false], ["ban_user", true]]);
assert.equal(M.clientChannel({ mcpShare: 0.58, restShare: 0.42 }), "mcp");
assert.equal(M.clientChannel({ mcpShare: 0, restShare: 1 }), "rest");
assert.equal(M.clientChannel(null), null);

/* ---- live calls ---- */
const c = (id, s) => ({ id, at: ago(s) });
const merged = M.mergeCalls([c("a", 10), c("b", 20)], [c("c", 1), c("a", 10)], 3);
assert.deepEqual(merged.map((x) => x.id), ["c", "a", "b"], "newest first, no duplicates");
assert.equal(M.mergeCalls([c("a", 1), c("b", 2)], [c("c", 0)], 2).length, 2, "capped");
assert.equal(M.newestAt([c("a", 10), c("b", 3)]), ago(3), "polls ?after= the newest call");
assert.equal(M.newestAt([]), null);
assert.deepEqual([M.statusTone(200), M.statusTone(204), M.statusTone(404), M.statusTone(429), M.statusTone(503)], ["s2", "s2", "s4", "s4", "s5"]);

/* ---- IP / CIDR ---- */
for (const ok of ["185.94.12.40", "185.94.12.0/24", "0.0.0.0/0", "10.0.0.1/32", "2001:db8::1", "2001:db8::/32", "::1", "::ffff:10.0.0.1", "fe80:0:0:0:0:0:0:1/64"]) assert.ok(M.isValidIpOrCidr(ok), `valid ${ok}`);
for (const bad of ["", "185.94.12", "256.1.1.1", "1.2.3.4/33", "1.2.3.04", "1.2.3.4/", "1.2.3.4/24/1", "2001:db8::/129", "1:2:3:4:5:6:7:8:9", "1::2::3", "localhost", "abc.def.ghi.jkl", "185.94.12.40 extra"]) assert.ok(!M.isValidIpOrCidr(bad), `invalid ${bad}`);
assert.deepEqual(M.parseIpList("185.94.12.40\n185.94.12.0/24, 185.94.12.40;  bad\n\n2001:DB8::1"), { list: ["185.94.12.40", "185.94.12.0/24", "2001:db8::1"], invalid: ["bad"] });
assert.deepEqual(M.parseIpList(""), { list: [], invalid: [] });
assert.ok(M.ipAllowedBy("185.94.12.40", ["185.94.12.0/24"]));
assert.ok(!M.ipAllowedBy("185.94.13.7", ["185.94.12.0/24"]));
assert.ok(M.ipAllowedBy("185.94.13.7", ["185.94.12.0/24", "185.94.13.7"]));
assert.ok(M.ipAllowedBy("9.9.9.9", ["0.0.0.0/0"]));
assert.ok(M.ipAllowedBy("2001:db8::1", ["2001:db8::1"]) && !M.ipAllowedBy("2001:db8::2", ["2001:db8::1"]));
assert.ok(!M.ipAllowedBy("1.2.3.4", []));

/* ---- snippets ---- */
const URL_ = "https://des-call.onrender.com/mcp";
assert.equal(M.apiOrigin(URL_), "https://des-call.onrender.com");
assert.equal(M.mcpHost("https://api.descall.com/mcp"), "api.descall.com/mcp", "MCP sunucusu · api.descall.com/mcp");
assert.equal(M.snippetText("claudeCode", URL_), `claude mcp add --transport http descall ${URL_} --header "Authorization: Bearer <TOKEN>"`, "contract: claude mcp add line");
const full = M.snippetText("claudeCode", URL_, "dsk_admin_SECRET");
assert.ok(full.includes("Bearer dsk_admin_SECRET\"") && !full.includes("<TOKEN>"), "the fresh secret fills the placeholder");
const desk = JSON.parse(M.snippetText("desktop", URL_));
assert.deepEqual(desk.mcpServers.descall.args, ["-y", "mcp-remote", URL_, "--header", "Authorization: Bearer <TOKEN>"], "Claude Desktop JSON parses");
const curl = M.snippetText("curl", URL_, "dsk_admin_X");
assert.ok(curl.startsWith(`curl "https://des-call.onrender.com/api/admin/users?limit=5"`) && curl.includes("Bearer dsk_admin_X"));
assert.deepEqual(M.snippetParts("claudeCode", URL_).filter((p) => p[0] === "ph").map((p) => p[1]), ["<TOKEN>"], "placeholder highlighted once");
assert.deepEqual(M.snippetParts("curl", URL_, "s").filter((p) => p[0] === "tok").map((p) => p[1]), ["s"]);
for (const k of M.SNIPPET_TABS) assert.equal(M.snippetParts(k, URL_).map((p) => p[1]).join(""), M.snippetText(k, URL_));

/* ---- alerts ---- */
const ipAlert = M.alertCopy({ kind: "new_ip", tokenName: "Moderasyon asistanı", ip: "91.214.33.7", country: "Almanya", detail: { previousIp: "185.62.40.21", previousCountry: "Türkiye", previousCount: 6520 } });
assert.equal(ipAlert.title.key, "atok.alert.ipTitle");
assert.equal(ipAlert.body.key, "atok.alert.ipBodyPrev");
assert.equal(ipAlert.body.vars.prevCount, 6520);
assert.equal(ipAlert.tone, "high");
assert.equal(M.alertCopy({ kind: "new_ip", ip: "1.1.1.1", detail: {} }).body.key, "atok.alert.ipBody");
const burst = M.alertCopy({ kind: "burst", tokenName: "Claude Code", detail: { count: 412, windowMin: 5, baseline: 22 } });
assert.deepEqual([burst.title.key, burst.title.vars.count, burst.body.vars.times, burst.tone], ["atok.alert.burstTitle", 412, 19, "med"], "19 kat like the draft");
assert.equal(M.alertCopy({ kind: "burst", detail: { count: 50 } }).body.key, "atok.alert.burstBodyNoBase");
assert.equal(M.alertCopy({ kind: "new_country", ip: "1.1.1.1", country: "X", detail: {} }).title.key, "atok.alert.countryTitle");
const AL = [{ id: 1, kind: "new_ip", status: "open" }, { id: 2, kind: "burst", status: "open" }, { id: 3, kind: "new_country", status: "dismissed" }];
assert.deepEqual(M.openAlerts(AL).map((a) => a.id), [1, 2]);
assert.deepEqual(M.alertKinds(AL), ["ip", "burst"], "Yeni IP ve ani artış");

/* ---- audit ---- */
assert.deepEqual(["admin_token.created", "admin_token.paused", "admin_token.resumed", "admin_token.rotated", "admin_token.revoked", "admin_token.restored", "admin_token.revoke_all", "admin_token.ip_list", "admin_token.alert", "ban"].map(M.auditKind), ["create", "pause", "resume", "rotate", "revoke", "restore", "panic", "ip", "alert", "dest"]);
assert.deepEqual(["security_token_create", "security_token_revoke_all", "security_token_ip_allowlist", "security_token_auto_pause", "security_token_rename", "security_token_resume"].map(M.auditKind), ["create", "panic", "ip", "pause", "edit", "resume"], "server action names");

/* ---- forms ---- */
assert.equal(M.cleanOtp("12 34-56x9"), "123456");
assert.ok(M.otpReady("123456") && !M.otpReady("12345"));
assert.equal(M.PANIC_WORD, "TÜMÜNÜ İPTAL ET", "contract confirm phrase");
assert.ok(M.typedMatches("  tümünü   iptal et ", M.PANIC_WORD), "Turkish upper-casing of i");
assert.ok(!M.typedMatches("TUMUNU IPTAL ET", M.PANIC_WORD));
assert.ok(!M.typedMatches("", M.PANIC_WORD));
assert.deepEqual(M.createErrors({ name: "", ipText: "x", code: "1" }), ["name", "ip", "code"]);
assert.deepEqual(M.createErrors({ name: "Claude Code", ipText: "185.94.12.40", code: "123456" }), []);
assert.deepEqual(M.createErrors({ name: "a".repeat(61), ipText: "", code: "123456" }), ["name"]);
assert.deepEqual(M.createBody({ name: "  Claude   Code ", expiresIn: "7d", ipText: "185.94.12.40\n185.94.12.40" }), { name: "Claude Code", expiresIn: "7d", ipAllowlist: ["185.94.12.40"] });
assert.equal(M.createBody({ name: "x", expiresIn: "bad", ipText: "" }).expiresIn, "30d");
assert.ok(M.revokeReady({ reason: "leaked", typed: "Claude Code", name: "Claude Code" }));
assert.ok(!M.revokeReady({ reason: "leaked", typed: "claude code", name: "Claude Code" }), "exact name");
assert.ok(!M.revokeReady({ reason: "", typed: "Claude Code", name: "Claude Code" }), "reason required");
assert.ok(!M.revokeReady({ reason: "suspicious", typed: "A", name: "A" }), "contract reasons only");
assert.deepEqual([...M.REVOKE_REASONS], ["leaked", "unused", "replaced", "other"]);
assert.deepEqual([...M.GRACE_OPTIONS], [0, 60, 1440], "hemen / 1 saat / 24 saat");
assert.ok(M.panicReady({ reason: "laptop", typed: "TÜMÜNÜ İPTAL ET", code: "123456", count: 5 }));
assert.ok(!M.panicReady({ reason: " ", typed: "TÜMÜNÜ İPTAL ET", code: "123456", count: 5 }), "reason required");
assert.ok(!M.panicReady({ reason: "x", typed: "TÜMÜNÜ İPTAL ET", code: "12345", count: 5 }), "code required");
assert.ok(!M.panicReady({ reason: "x", typed: "TÜMÜNÜ İPTAL ET", code: "123456", count: 0 }), "nothing to revoke");
assert.deepEqual(M.sameSettings({ name: "Yedek", expiresIn: "30d", ipAllowlist: ["1.2.3.4", "5.6.7.0/24"] }), { name: "Yedek", expiresIn: "30d", ipText: "1.2.3.4\n5.6.7.0/24" });
assert.equal(M.errorKey({ code: "CONFIRM_MISMATCH" }), "atok.err.confirm");
assert.equal(M.errorKey({ status: 404 }), "atok.err.notDeployed");
assert.equal(M.errorKey({ code: "TOKEN_NOT_FOUND", status: 404 }), "atok.err.notFound");
assert.equal(M.errorKey(new Error("x")), "atok.err.generic");
for (const code of ["TOKENS_UNAVAILABLE", "TOKEN_NOT_FOUND", "NAME_REQUIRED", "BAD_EXPIRY", "BAD_IP", "CONFIRM_MISMATCH", "RESTORE_EXPIRED", "OWNER_ONLY", "TOKEN_REVOKED", "BAD_REASON", "BAD_GRACE", "BAD_ACTION", "ALERT_NOT_FOUND"]) assert.ok(M.ERROR_CODES.includes(code), `contract error ${code}`);

/* ---- locale parity ---- */
const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];
function flat(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") flat(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = v;
  }
  return out;
}
const args = (s) => [...messageArguments(s)].sort().join(",");
const packs = {};
for (const code of LOCALES) {
  const mod = await import(pathToFileURL(join(here, `../../../i18n/locales/atok.${code}.js`)).href);
  packs[code] = flat(Object.values(mod)[0]);
}
const base = packs.tr;
for (const code of LOCALES) {
  assert.deepEqual(Object.keys(packs[code]).sort(), Object.keys(base).sort(), `${code}: same keys as tr`);
  for (const [k, v] of Object.entries(packs[code])) {
    assert.equal(typeof v, "string", `${code}.${k} is text`);
    assert.ok(v.trim().length > 0, `${code}.${k} not empty`);
    assert.equal(args(v), args(base[k]), `${code}.${k} placeholders`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(v), `${code}.${k}: no emoji`);
    if (code !== "tr" && k !== "nav" && k !== "title" && !/^(dash|sep|pct|ms|ep\.destTag|conn\.(tab\.|sub$)|mcpShare|hero\.(mcp|rest)|create\.(ipPh|expSum)|audit\.when)/.test(k) && v.length > 12) {
      assert.notEqual(v, base[k], `${code}.${k} is translated`);
    }
  }
  assert.ok(!packs[code]["panic.typeAfter"].includes("{"), "the typed word is shown, not a placeholder");
  const main = readFileSync(join(here, `../../../i18n/locales/${code}.js`), "utf8");
  assert.match(main, new RegExp(`from "\\./atok\\.${code.replace("-", "\\-")}\\.js"`), `${code}.js imports atok`);
  assert.match(main, /"?atok"?: ATOK_/, `${code}.js registers atok`);
}
for (const [k, v] of Object.entries(base)) assert.ok(!v.includes("..."), `tr ${k}: ellipsis character, not three dots`);
assert.equal(base["revoke.warn"], "Son 24 saatte bu tokenla {n} istek yapıldı. İptal 10 dakika içinde 2FA ile geri alınabilir; sonra kalıcıdır.", "draft wording");
assert.equal(base["reveal.warnTitle"], "Bu token hesabının tamamına erişir. Sadece bir kez gösterilir.", "draft wording");

/* ---- every key the page uses exists ---- */
const files = readdirSync(here).filter((f) => /\.jsx?$/.test(f) && !f.includes("selftest"));
const used = new Set();
const dynamic = [];
for (const f of files) {
  const src = read(f);
  assert.ok(!/\p{Extended_Pictographic}/u.test(src), `${f}: no emoji`);
  assert.ok(!/\.toLocale(?:Date|Time)?String\(\s*\)/.test(src), `${f}: locale-aware dates only`);
  for (const m of src.matchAll(/["'`](atok\.[A-Za-z0-9_.]+)["'`]/g)) used.add(m[1]);
  for (const m of src.matchAll(/`(atok\.[^`]*\$\{[^`]+)`/g)) dynamic.push(m[1]);
}
for (const k of used) {
  if (k.endsWith(".")) continue;
  assert.ok(k.slice(5) in base, `missing locale key ${k}`);
}
assert.ok(dynamic.length > 0, "dynamic keys are listed below");
for (const s of M.STATUSES) assert.ok(`status.${s}` in base);
for (const e of M.EXPIRY_OPTIONS) assert.ok(`exp.${e}` in base);
for (const r of M.REVOKE_REASONS) assert.ok(`revoke.r.${r}` in base);
for (const g of M.GRACE_OPTIONS) assert.ok(`rotate.g${g}` in base);
for (const r of M.AUTO_PAUSE_RULES) assert.ok(`alerts.rule.${r}` in base);
for (const f of M.FILTERS) assert.ok(`list.${f}` in base);
for (const k of M.SNIPPET_TABS) assert.ok(`conn.tab.${k}` in base);
for (const k of ["ban", "delete", "descoin", "broadcast"]) assert.ok(`destKind.${k}` in base && `calls.kind.${k}` in base);
for (const k of ["ip", "country", "burst"]) assert.ok(`alertKind.${k}` in base);
for (const k of ["sessions", "tools", "endpoints", "latency"]) assert.ok(`conn.${k}` in base);
for (const k of ["access1", "access2", "access3"]) assert.ok(`create.${k}` in base);
for (const k of ["mcp", "rest"]) assert.ok(`hero.${k}` in base);
for (const k of ["all", "live", "dead"]) assert.ok(`list.${k}` in base);
for (const code of M.ERROR_CODES) assert.ok(M.errorKey({ code }).slice(5) in base, `error ${code}`);
for (const l of [M.agoLabel(ago(1), NOW), M.agoLabel(ago(30), NOW), M.agoLabel(ago(300), NOW), M.agoLabel(ago(7200), NOW), M.agoLabel(ago(9e5), NOW), M.agoLabel(null, NOW)]) assert.ok(l.key.slice(5) in base, l.key);
for (const l of [M.leftLabel(null), M.leftLabel(ago(1), NOW), M.leftLabel(ahead(60), NOW), M.leftLabel(ahead(7200), NOW), M.leftLabel(ahead(9e5), NOW), M.validityLabel({ status: "revoked" })]) assert.ok(l.key.slice(5) in base, l.key);
for (const a of [ipAlert, burst, M.alertCopy({ kind: "new_country", detail: { previousCount: 2, previousIp: "x" } }), M.alertCopy({ kind: "burst", detail: {} })]) {
  assert.ok(a.title.key.slice(5) in base && a.body.key.slice(5) in base, a.body.key);
}

/* ---- panel wiring ---- */
const panel = read("../AdminPanel.jsx");
const nav = await import(pathToFileURL(join(here, "../adminNav.js")).href);
assert.match(panel, /\{ id: "adminToken", label: "atok\.nav", icon: KeyRound \}/, "tab registered");
assert.match(panel, /tab === "adminToken" && perm\.owner && \(/, "rendered for the owner only");
assert.match(panel, /withOwnerTabs\(Array\.isArray\(d\?\.sections\) \? d\.sections : \["overview"\], Boolean\(d\?\.owner\)\)/, "owner-only tab added from /me/permissions");
const sys = nav.ADMIN_NAV_GROUPS.find(([k]) => k === "system")[1];
assert.equal(sys.indexOf("adminToken"), sys.indexOf("security") + 1, "under Güvenlik in the menu");
assert.deepEqual(nav.withOwnerTabs(["overview", "audit"], true), ["overview", "audit", "adminToken"]);
assert.deepEqual(nav.withOwnerTabs(["overview", "adminToken"], false), ["overview"], "never for another admin, even if listed");
assert.deepEqual(nav.withOwnerTabs(null, false), ["overview"]);
assert.match(panel, /initialQuery=\{auditQuery\?\.q \? \{ q: auditQuery\.q \} : null\}/, "İşlem kaydında gör opens İşlem kaydı filtered");
assert.match(read("../audit/AdminAudit.jsx"), /initialQuery \? queryToTokens\(initialQuery\) : \[\]/);

/* ---- API contract ---- */
const api = read("tokenApi.js");
for (const p of ['"/tokens"', "`/tokens/${enc(id)}`", "`/tokens/${enc(id)}/calls", "`/tokens/${enc(id)}/rotate`", "`/tokens/${enc(id)}/revoke`", "`/tokens/${enc(id)}/restore`", '"/tokens/revoke-all"', "`/tokens/alerts/${enc(alertId)}`", '"/tokens/auto-pause"', '"/openapi.json"']) {
  assert.ok(api.includes(p), `api path ${p}`);
}
assert.match(api, /"PATCH"/);
assert.match(api, /"PUT"/);
assert.match(api, /adminStepUpRequest\(code\)/, "the form's code goes through the step-up exchange");
assert.match(api, /setStepUpToken\(res\.token/);
const page = read("AdminTokens.jsx");
assert.match(page, /available === false/, "migration-not-applied state");
assert.match(page, /CALLS_POLL_MS/);
assert.match(page, /socket\.on\("admin:token-alert", onAlert\)/, "new alerts arrive live");
assert.match(page, /socket\.on\("admin:update", soon\)/);
assert.match(panel, /<AdminTokens\s+socket=\{socket\}/);
for (const f of files) assert.ok(!/\.serverText|err(?:or)?\.message\b/.test(read(f)), `${f}: never shows the server's raw error text`);
assert.match(page, /if \(!visible \|\| !selectedId/, "live calls pause on a hidden tab");
assert.match(page, /tokenApi\.revokeAll\(|onDone=/);
assert.equal(M.CALLS_POLL_MS, 3000, "every 3 s");
const dialogs = read("TokenDialogs.jsx");
assert.match(dialogs, /confirm: PANIC_WORD/, "revoke-all sends the contract phrase");
assert.match(dialogs, /revokeAll\(\{ reason: "other", note: reason\.trim\(\)/, "revoke-all: reason code from the contract list, the typed reason as the note");
assert.match(dialogs, /confirmName: typed\.trim\(\)/);
assert.match(dialogs, /locked=\{Boolean\(result\)\}/, "the reveal cannot be dismissed before Kaydettim");
assert.match(dialogs, /disabled=\{!saved\}/);

/* ---- styles ---- */
const css = readFileSync(join(here, "../../../styles/admin-tokens.css"), "utf8");
for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
  assert.match(m[1].trim(), /^var\(--fs-(11|12|13|15|17|20|28)\)( !important)?$/, `admin-tokens.css font-size ${m[1]}`);
}
assert.ok(!/\p{Extended_Pictographic}/u.test(css));
assert.match(css, /\.atk-dlg \{[^}]*background: #121828/, "dialogs are opaque");
assert.match(css, /\.atk-drawer \{[^}]*background: #121828/, "drawer is opaque");
assert.match(css, /\.atk-toast \{[^}]*background: #1b2238/, "toast is opaque");
assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*\.atk-dlg \{[^}]*border-radius: 18px 18px 0 0/, "dialogs are bottom sheets on a phone");
assert.match(css, /html\.glass-desktop :is\(\.atk, \.atk-scrim\)/, "focus ring wins over the glass-desktop rule");
assert.match(css, /#587af5/, "accent");

console.log("adminTokens.selftest ok");
