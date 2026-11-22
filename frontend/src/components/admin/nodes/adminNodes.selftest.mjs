// Sunucu Ağı (admin, owner only, Draft A "Kontrol merkezi"): pure model (page state,
// capacity preview with the server's formula, chart buckets, schedule grid <-> slots,
// event lines, errors), locale parity in 7 languages, every anodes.* key the page uses
// exists, the panel wiring (owner-only tab right after Sistem), the REST + socket contract
// shared with backend/routes/adminNodes.js, destructive dialogs (reason + confirm), styles
// (type scale, PC colour, phone layout), no emoji.
//   node src/components/admin/nodes/adminNodes.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as M from "./nodeModel.js";
import { messageArguments } from "../../../i18n/message.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), "utf8");
const panel0 = () => read("../AdminPanel.jsx");
const require = createRequire(import.meta.url);
const S = require("../../../../backend/lib/nodeKeys/model.js");
const NOW = Date.parse("2026-11-22T20:30:00.000Z");

const render = { id: "render", role: "primary", memRss: 312, memLimit: 512, conns: 58, cpu: 22, p95ms: 48, errRate: 0.2, state: "active" };
const pc = { id: "pc-demir", role: "secondary", memRss: 1454, memLimit: 3072, conns: 126, cpu: 9, p95ms: 31, errRate: 0, state: "active", cores: 4 };
const data = (extra = {}) => ({ available: true, single: false, kv: { ok: true, usedMb: 3.2, maxMb: 25, configured: true }, nodes: [render, pc], leader: "render", cfg: { ramMb: 3072, cores: 4, loadRule: { enabled: true, renderHighPct: 60, pcHighPct: 85 }, gameMode: { enabled: true, shareMb: 1024, fullHandover: false }, schedule: { enabled: true, tz: "Europe/Istanbul", slots: [] }, alerts: { pcDown: true, kvFull: true, render90: true } }, capacity: { estimate: 1098, perUserMb: 2.5 }, pc: { registered: true }, ...extra });

/* ---- page state ---- */
assert.equal(M.viewState(null), "loading");
assert.equal(M.viewState(data()), "ready");
assert.equal(M.viewState(data({ single: true, kv: { ok: false, configured: false } })), "single", "no REDIS_URL: Ortak bellek bağlı değil");
assert.equal(M.viewState(data({ single: true, kv: { ok: false, configured: true } })), "kvDown", "REDIS_URL set but unreachable");
assert.equal(M.viewState(data({ nodes: [render], pc: { registered: false } })), "noPc", "PC never registered: setup steps");
assert.equal(M.viewState(data({ nodes: [render], pc: { registered: true } })), "pcOff");
assert.equal(M.viewState(data({ nodes: [render, { ...pc, state: "down" }] })), "pcOff");
assert.deepEqual(M.pickNodes(data()), { render, pc });
assert.equal(M.stateKey("draining"), "anodes.state.draining");
assert.equal(M.stateKey("weird"), "anodes.state.down");
assert.equal(M.memPct(render), 61, "312 / 512 MB is 61 % like the draft");
assert.equal(M.memPct(pc), 47, "1,42 / 3 GB is 47 % like the draft");
assert.equal(M.memTone(61, 60), "warn");
assert.equal(M.memTone(30, 60), "ok");
assert.equal(M.memTone(92, 60), "bad");

/* ---- capacity: the same numbers as the server ---- */
for (const ramMb of [512, 1024, 3072, 8192]) {
  const ui = M.capacityFor(data({ capacity: { perUserMb: S.perUserMb([render, pc]) } }), ramMb);
  const srv = S.capacity([render, pc], { ramMb }, { ramMb, assumePc: true });
  assert.equal(ui.estimate, srv.estimate, `capacity parity at ${ramMb} MB`);
  assert.equal(ui.renderUsers + ui.pcUsers, ui.estimate);
}
assert.ok(M.capacityFor(data(), 8192).estimate > M.capacityFor(data(), 3072).estimate, "more RAM, more users");
assert.equal(M.BASE_MB, S.BASE_MB);
assert.equal(M.HEADROOM, S.HEADROOM);
assert.equal(M.PER_USER_MB_DEFAULT, S.PER_USER_MB_DEFAULT);
assert.equal(M.RAM_MIN_MB, S.RAM_MIN_MB);
assert.equal(M.RAM_MAX_MB, S.RAM_MAX_MB);
assert.equal(M.RAM_STEP_MB, S.RAM_STEP_MB);
assert.equal(M.CORES_MAX, S.CORES_MAX);
assert.deepEqual([...M.RENDER_PCT], [...S.RENDER_PCT]);
assert.deepEqual([...M.PC_PCT], [...S.PC_PCT]);
assert.equal(M.KEY_NAME_MAX, S.KEY_NAME_MAX);
assert.equal(M.REASON_MIN, S.REASON_MIN);
assert.deepEqual([...M.ALERT_KINDS], [...S.ALERT_KINDS]);

/* ---- PC share draft ---- */
const d0 = M.draftOf(data().cfg);
assert.deepEqual(d0, { ramMb: 3072, cores: 4, loadRule: { enabled: true, renderHighPct: 60, pcHighPct: 85 } });
assert.equal(M.sharePatch(data().cfg, d0), null, "nothing changed: Apply stays off");
assert.deepEqual(M.sharePatch(data().cfg, { ...d0, ramMb: 4096 }), { ramMb: 4096 });
assert.deepEqual(M.sharePatch(data().cfg, { ...d0, loadRule: { ...d0.loadRule, enabled: false } }), { loadRule: { enabled: false } });
assert.equal(M.draftOf({ ramMb: 99999, cores: 77 }).ramMb, 8192, "clamped to 8 GB");
assert.equal(M.draftOf({ ramMb: 99999, cores: 77 }).cores, 8);
assert.equal(M.draftOf({ ramMb: 700 }).ramMb, 512, "snapped to 512 MB steps");
assert.ok(S.validateCfgPatch(M.sharePatch(data().cfg, { ...d0, ramMb: 4096, cores: 6 }), data().cfg).ok, "the UI patch passes the server validation");
assert.deepEqual(M.shareChoices(1024), [512, 1024], "game share never above the RAM share");
assert.deepEqual(M.shareChoices(256), [256]);

/* ---- schedule grid ---- */
for (const k of ["evenings", "nightly", "always", "clear"]) {
  const g = M.presetGrid(k);
  const slots = M.gridToSlots(g);
  assert.deepEqual(M.slotsToGrid(slots), g, `${k}: grid -> slots -> grid`);
  assert.ok(S.validateCfgPatch({ schedule: { slots } }, null).ok, `${k}: slots pass the server validation`);
}
assert.deepEqual(M.gridToSlots(M.presetGrid("evenings")).filter((s) => s.d === 1), [{ d: 1, from: "18:00", to: "02:00" }], "weekday evenings run overnight like the draft");
assert.deepEqual(M.gridToSlots(M.presetGrid("evenings")).find((s) => s.d === 6), { d: 6, from: "12:00", to: "03:00" }, "Saturday into Sunday morning is one slot");
assert.equal(M.gridHours(M.presetGrid("always")), 168);
assert.equal(M.gridHours(M.presetGrid("clear")), 0);
const custom = M.presetGrid("clear");
custom[3][9] = custom[3][10] = custom[3][14] = true;
custom[0][23] = true;
custom[1][0] = true;
const cs = M.gridToSlots(custom);
assert.deepEqual(M.slotsToGrid(cs), custom, "custom grid round-trips");
assert.ok(cs.some((s) => s.d === 0 && s.from === "23:00" && s.to === "01:00"), "Sunday 23 + Monday 0 is one overnight slot");
// Server and client agree on what "now" is for a slot.
const slots = [{ d: 1, from: "18:00", to: "02:00" }];
const grid = M.slotsToGrid(slots);
for (const iso of ["2026-11-23T17:30:00Z", "2026-11-23T22:30:00Z", "2026-11-24T09:00:00Z", "2026-11-23T14:59:00Z"]) {
  const { d, minute } = S.localClock(new Date(iso), "Europe/Istanbul");
  assert.equal(grid[d][Math.floor(minute / 60)], S.inSchedule({ schedule: { enabled: true, slots } }, new Date(iso)), `grid vs server at ${iso}`);
}
assert.deepEqual(M.scheduleSummary({ enabled: true, slots: M.gridToSlots(M.presetGrid("evenings")) }), { key: "anodes.plan.weekBoth", vars: { week: "18:00-02:00", weekend: "12:00-03:00" } });
assert.deepEqual(M.scheduleSummary({ enabled: true, slots: M.gridToSlots(M.presetGrid("nightly")) }), { key: "anodes.plan.daily", vars: { week: "18:00-02:00" } });
assert.equal(M.scheduleSummary({ enabled: true, slots: M.gridToSlots(M.presetGrid("always")) }).key, "anodes.plan.allDay");
assert.equal(M.scheduleSummary({ enabled: false, slots }).key, "anodes.plan.always");
assert.deepEqual(M.scheduleSummary({ enabled: true, slots: [1, 2, 3, 4, 5].map((d) => ({ d, from: "18:00", to: "02:00" })) }), { key: "anodes.plan.weekdays", vars: { week: "18:00-02:00" } });
assert.equal(M.scheduleSummary({ enabled: true, slots: cs }).key, "anodes.plan.hours");
assert.deepEqual([...M.DAY_ORDER], [1, 2, 3, 4, 5, 6, 0], "Monday first, like the draft");

/* ---- charts ---- */
const series = {
  render: [{ t: NOW - 20000, rss: 300, conns: 50, p95: 45, err: 0.1 }, { t: NOW - 10000, rss: 312, conns: 58, p95: 48, err: 0.2 }],
  "pc-demir": [{ t: NOW - 10000, rss: 1454, conns: 126, p95: 31, err: 0 }],
  old: [{ t: NOW - 2 * 3600e3, rss: 1, p95: 999 }],
};
const ch = M.chartSeries(series, data(), NOW);
assert.equal(ch.n, 361, "1 h of 10 s buckets");
assert.equal(M.lastValue(ch.renderMb), 312);
assert.equal(Math.round(M.lastValue(ch.render)), 61, "memory as % of the node limit");
assert.equal(Math.round(M.lastValue(ch.pc)), 47);
assert.equal(M.lastValue(ch.p95), 48, "network p95 = the slowest node");
assert.equal(M.lastValue(ch.conns), 184, "58 + 126 like the draft");
assert.ok(!ch.p95.includes(999), "samples older than an hour are dropped");
const lp = M.linePath([1, null, 2, 3], 300, 100, 3);
assert.equal((lp.match(/M/g) || []).length, 2, "a gap breaks the line");
assert.equal(M.linePath([null, null], 10, 10, 1), "");
assert.ok(M.areaPath([1, 2, 3], 300, 100, 3).endsWith("Z"));
assert.equal(M.niceMax([48, 120], 100), 150);
assert.equal(M.niceMax([], 100), 100);
assert.equal(M.indexAt(0.5, 361), 180);
const live = M.appendLive({}, data(), NOW);
assert.equal(live.render.length, 1);
assert.equal(live["pc-demir"][0].conns, 126);
assert.equal(M.appendLive(live, data(), NOW + 1000).render.length, 1, "same bucket replaced, not doubled");

/* ---- events ---- */
const drill = M.eventLine({ kind: "drill", detail: { moved: 42, dropped: 0, ms: 3100 } });
assert.deepEqual(drill.effect, { key: "anodes.ev.drillOk", vars: drill.effect.vars });
assert.equal(drill.effect.vars.sec, 3.1);
assert.equal(M.eventLine({ kind: "drill", detail: { moved: 40, dropped: 2 } }).effect.key, "anodes.ev.drillLoss");
assert.equal(M.eventLine({ kind: "cfg_update", detail: { ramMb: 1024, prevRamMb: 3072 } }).effect.key, "anodes.ev.capacity", "pay 3 → 1 GB like the draft");
assert.equal(M.eventLine({ kind: "alert_kvFull", detail: { reason: "down" } }).what.key, "anodes.ev.k.alert_kvDown");
assert.deepEqual(M.eventLine({ kind: "mystery" }).what, { key: "anodes.ev.k.other", vars: { kind: "mystery" } });
assert.equal(M.eventLine({ kind: "node_register" }).tone, "pc");

/* ---- forms, errors, time ---- */
assert.ok(!M.reasonOk("ab") && M.reasonOk("bakım") && !M.reasonOk("x".repeat(301)));
assert.ok(M.keyNameOk("Ev PC") && !M.keyNameOk(" ") && !M.keyNameOk("x".repeat(41)));
assert.equal(M.maskKey({ prefix: "Ab3x", last4: "9QeK" }), "dsk_node_Ab3x\u20269QeK");
assert.equal(M.maskKey({ masked: "dsk_node_ZZZZ\u2026YYYY" }), "dsk_node_ZZZZ\u2026YYYY", "the server's masked string wins");
assert.equal(M.KEY_PREFIX, S.KEY_PREFIX);
const navMod = await import(pathToFileURL(join(here, "../adminNav.js")).href);
assert.equal(navMod.initialTabFromQuery("?tab=nodes"), "nodes", "the Descall Node app opens /admin/panel?tab=nodes");
assert.equal(navMod.initialTabFromQuery("?tab=evil<x>"), null);
assert.equal(navMod.initialTabFromQuery("?tab=nope"), null, "unknown pages are ignored");
assert.equal(navMod.initialTabFromQuery(""), null);
assert.match(panel0(), /initialTabFromQuery\(/, "the panel reads ?tab=");
assert.equal(S.BASE_MB, 180, "same base as the Descall Node app");
assert.equal(Math.round(S.USD_PER_GB_HOUR * 730 * 100) / 100, 12.5, "12.5 USD per GB-month");
assert.equal(M.errorKey({ code: "KEY_LIMIT" }), "anodes.err.keyLimit");
assert.equal(M.errorKey({ status: 404 }), "anodes.err.notDeployed");
assert.equal(M.errorKey({ status: 403 }), "anodes.err.ownerOnly");
assert.equal(M.errorKey(new Error("x")), "anodes.err.generic");
const routeSrc = readFileSync(join(here, "../../../../backend/routes/adminNodes.js"), "utf8");
const serverCodes = [...routeSrc.matchAll(/^\s{2}([A-Z_]+): /gm)].map((m) => m[1]).filter((c) => c !== "INTERNAL");
for (const code of serverCodes) assert.ok(M.ERROR_CODES.includes(code), `server error ${code} has its own text`);
assert.deepEqual(M.agoLabel(new Date(NOW - 13000).toISOString(), NOW), { key: "anodes.ago.s", vars: { n: 13 } });
assert.equal(M.agoLabel(null, NOW).key, "anodes.ago.never");

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
  const mod = await import(pathToFileURL(join(here, `../../../i18n/locales/anodes.${code}.js`)).href);
  packs[code] = flat(Object.values(mod)[0]);
}
const base = packs.tr;
const SAME_OK = /^(dash|approx|gbUnit|pctN|secN|chip\.kv|kpi\.(render|connRender|connPc|ofMb|ofGb)|chart\.(pc|p95|tipP95|tipRender)|plan\.cell|ev\.capacity)$/;
for (const code of LOCALES) {
  assert.deepEqual(Object.keys(packs[code]).sort(), Object.keys(base).sort(), `${code}: same keys as tr`);
  for (const [k, v] of Object.entries(packs[code])) {
    assert.equal(typeof v, "string", `${code}.${k} is text`);
    assert.ok(v.trim().length > 0, `${code}.${k} not empty`);
    assert.equal(args(v), args(base[k]), `${code}.${k} placeholders`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(v), `${code}.${k}: no emoji`);
    if (code !== "tr" && !SAME_OK.test(k) && v.length > 8) assert.notEqual(v, base[k], `${code}.${k} is translated`);
  }
  const main = readFileSync(join(here, `../../../i18n/locales/${code}.js`), "utf8");
  assert.match(main, new RegExp(`from "\\./anodes\\.${code.replace("-", "\\-")}\\.js"`), `${code}.js imports anodes`);
  assert.match(main, /"?anodes"?: ANODES_/, `${code}.js registers anodes`);
}
for (const [k, v] of Object.entries(base)) assert.ok(!v.includes("..."), `tr ${k}: ellipsis character, not three dots`);
// Draft A wording, one to one.
assert.equal(base["kpi.pc"], "Senin PC'n");
assert.equal(base["chart.memTitle"], "Bellek, son 1 saat");
assert.equal(base["chart.latTitle"], "Gecikme ve hata");
assert.equal(base["chart.limit90"], "Render %90 sınırı");
assert.equal(base["share.title"], "PC payı");
assert.equal(base["share.ram"], "RAM sınırı");
assert.equal(base["share.cores"], "CPU çekirdeği");
assert.equal(base["share.apply"], "Uygula");
assert.equal(base["share.preview"], "Önizle: kapasite");
assert.equal(base["game.title"], "Oyun modu ve plan");
assert.equal(base["game.full"], "GPU %80 üstü 30 sn → tamamen devret");
assert.equal(base["act.title"], "Hızlı işlemler");
assert.equal(base["act.drain"], "PC'yi nazikçe boşalt");
assert.equal(base["act.emergency"], "Herkesi Render'a al (acil)");
assert.equal(base["act.drill"], "Devir provası yap");
assert.equal(base["act.revokeKey"], "PC düğüm anahtarını iptal et");
assert.equal(base["ev.title"], "Olaylar");
assert.equal(base["kpi.capacity"], "Kapasite tahmini");
assert.equal(base["kpi.capacitySub"], "bu ayarla eşzamanlı kullanıcı");
assert.equal(base["banner.singleTitle"], "Ortak bellek bağlı değil: tek sunucu modunda", "the owner's wording for single-node mode");

/* ---- every key the page uses exists ---- */
const files = readdirSync(here).filter((f) => /\.jsx?$/.test(f) && !f.includes("selftest"));
const used = new Set();
for (const f of files) {
  const src = read(f);
  assert.ok(!/\p{Extended_Pictographic}/u.test(src), `${f}: no emoji`);
  assert.ok(!/\.toLocale(?:Date|Time)?String\(\s*\)/.test(src), `${f}: locale-aware dates only`);
  assert.ok(!/\.serverText|err(?:or)?\.message\b/.test(src), `${f}: never shows the server's raw error text`);
  for (const m of src.matchAll(/["'`](anodes\.[A-Za-z0-9_.]+)["'`]/g)) used.add(m[1]);
}
for (const k of used) {
  if (k.endsWith(".")) continue;
  assert.ok(k.slice(7) in base, `missing locale key ${k}`);
}
assert.ok("nav" in base, "menu label");
for (const s of M.NODE_STATES) assert.ok(`state.${s}` in base);
assert.ok("state.none" in base);
for (let d = 0; d < 7; d += 1) assert.ok(`day.s${d}` in base && `day.l${d}` in base);
for (const k of M.ALERT_KINDS) assert.ok(`alerts.${k}` in base && `alerts.${k}Sub` in base && `alertToast.${k}` in base);
assert.ok("alertToast.kvDown" in base && "alertToast.test" in base);
for (const k of ["s1", "s2", "s3"]) assert.ok(`drill.${k}` in base);
for (const k of ["evenings", "nightly", "always", "clear"]) assert.ok(`plan.preset.${k}` in base);
for (const k of ["kv", "key", "app", "drill"]) assert.ok(`setup.${k}` in base && `setup.${k}Sub` in base);
for (const k of M.EVENT_KINDS) assert.ok(`ev.k.${k}` in base, `event ${k}`);
assert.ok("ev.k.alert_kvDown" in base && "ev.k.other" in base);
for (const code of M.ERROR_CODES) assert.ok(M.errorKey({ code }).slice(7) in base, `error ${code}`);
for (const l of [M.agoLabel(new Date(NOW).toISOString(), NOW), M.agoLabel(new Date(NOW - 3e4).toISOString(), NOW), M.agoLabel(new Date(NOW - 3e5).toISOString(), NOW), M.agoLabel(new Date(NOW - 7.2e6).toISOString(), NOW), M.agoLabel(new Date(NOW - 9e8).toISOString(), NOW), M.agoLabel(null)]) assert.ok(l.key.slice(7) in base, l.key);
for (const ev of M.EVENT_KINDS.map((kind) => M.eventLine({ kind, detail: { dropped: 1, ramMb: 1024, prevRamMb: 2048, reason: "down" } }))) {
  assert.ok(ev.what.key.slice(7) in base, ev.what.key);
  if (ev.effect) assert.ok(ev.effect.key.slice(7) in base, ev.effect.key);
}

/* ---- panel wiring ---- */
const panel = read("../AdminPanel.jsx");
const nav = await import(pathToFileURL(join(here, "../adminNav.js")).href);
assert.match(panel, /\{ id: "nodes", label: "anodes\.nav", icon: Network \}/, "tab registered");
assert.match(panel, /tab === "nodes" && perm\.owner && \(/, "rendered for the owner only");
assert.match(panel, /<AdminNodes\s+socket=\{socket\}/);
assert.ok(nav.OWNER_ONLY_TABS.includes("nodes"), "owner-only page");
assert.deepEqual(nav.withOwnerTabs(["overview", "nodes"], false), ["overview"], "never for another admin, even if listed");
assert.ok(nav.withOwnerTabs(["overview"], true).includes("nodes"));
const sys = nav.ADMIN_NAV_GROUPS.find(([k]) => k === "system")[1];
assert.equal(sys.indexOf("nodes"), sys.indexOf("system") + 1, "right after Sistem in the menu");

/* ---- REST + socket contract ---- */
const api = read("nodeApi.js");
for (const p of ['"/nodes"', "`/nodes/metrics?minutes=", '"/nodes/pc-config"', "`/nodes/${enc(id)}/drain`", "`/nodes/${enc(id)}/resume`", '"/nodes/all-to-render"', '"/nodes/drill"', '"/nodes/keys"', "`/nodes/keys/${enc(id)}/revoke`", '"/nodes/alerts/test"']) {
  assert.ok(api.includes(p), `api path ${p}`);
}
for (const p of ['"/nodes"', '"/nodes/metrics"', '"/nodes/pc-config"', '"/nodes/:id/drain"', '"/nodes/:id/resume"', '"/nodes/all-to-render"', '"/nodes/drill"', '"/nodes/keys"', '"/nodes/keys/:id/revoke"', '"/nodes/alerts/test"']) {
  assert.ok(routeSrc.includes(`router.${p.includes("metrics") || p === '"/nodes"' ? "get" : p === '"/nodes/keys"' ? "post" : p === '"/nodes/pc-config"' ? "put" : "post"}(${p}`), `server route ${p}`);
}
assert.match(routeSrc, /router\.get\("\/nodes\/keys"/);
assert.match(api, /allToRender: \(reason\) => send\("\/nodes\/all-to-render", "POST", \{ reason, confirm: true \}\)/, "emergency sends the confirmation");
assert.match(api, /adminFetch/, "every call through adminFetch (step-up prompt)");
const monitorSrc = readFileSync(join(here, "../../../../backend/lib/nodeKeys/monitor.js"), "utf8");
const page = read("AdminNodes.jsx");
for (const ev of ["admin:nodes:watch", "admin:nodes:unwatch", "admin:nodes-alert"]) {
  assert.ok(monitorSrc.includes(`"${ev}"`) && page.includes(`"${ev}"`), `socket event ${ev} on both sides`);
}
assert.match(page, /socket\.on\("admin:nodes", onData\)/, "live push");
assert.match(monitorSrc, /const ROOM = "admin:nodes"/, "owner room");
assert.match(page, /PUSH_FALLBACK_MS/, "polling only as the fallback");
assert.match(page, /if \(!visible\) return undefined;/, "no polling on a hidden tab");
assert.match(readFileSync(join(here, "../../../../backend/lib/adminPermissions.js"), "utf8"), /\[\/\^\\\/nodes\(\\\/\|\$\)\/, null\]/, "server: /nodes is owner-checked by the router, not a grantable section");

/* ---- destructive actions: reason + confirmation ---- */
const dialogs = read("NodeDialogs.jsx");
assert.match(dialogs, /disabled=\{busy \|\| !sure \|\| !reasonOk\(reason\)\}/, "emergency: reason + I understand");
assert.match(dialogs, /disabled=\{busy \|\| !match \|\| !reasonOk\(reason\)\}/, "revoke: reason + typed key name");
assert.match(dialogs, /confirmName: typed\.trim\(\)/);
assert.match(dialogs, /disabled=\{busy \|\| !reasonOk\(reason\)\}/, "drain: reason");
assert.match(dialogs, /locked=\{Boolean\(secret\)\}/, "the one-time secret cannot be dismissed by accident");
assert.match(dialogs, /disabled=\{!saved\}/, "closing the reveal needs 'Anahtarı kaydettim'");
assert.match(dialogs, /copyText\(secret\)/, "copy button");
assert.match(dialogs, /disabled=\{busy \|\| emptyOn\}/, "an empty plan cannot be saved while the plan is on");

/* ---- styles ---- */
const css = readFileSync(join(here, "../../../styles/admin-nodes.css"), "utf8");
for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
  assert.match(m[1].trim(), /^var\(--fs-(11|12|13|15|17|20|28)\)( !important)?$/, `admin-nodes.css font-size ${m[1]}`);
}
assert.ok(!/\p{Extended_Pictographic}/u.test(css));
assert.match(css, /#b47cff/i, "PC colour");
assert.match(css, /@container atk \(max-width: 760px\)/, "phone layout");
assert.match(css, /\.anx-tip \{[^}]*background: #171e31/, "chart tooltip is opaque");
assert.match(css, /\.anx-heat-row \{[^}]*repeat\(24/, "weekly hour grid");
assert.match(page, /import "\.\.\/\.\.\/\.\.\/styles\/admin-tokens\.css";/, "dialogs come from the Admin Token base (opaque)");
assert.equal(M.PC_COLOR, "#b47cff");
assert.equal(M.ACCENT, "#587af5");

console.log("adminNodes.selftest ok");
