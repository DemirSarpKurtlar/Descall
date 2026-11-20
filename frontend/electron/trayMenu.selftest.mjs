// Tray panel (draft B "Gelismis menu"): shell rules (electron/trayMenuModel.cjs) and the
// panel page's pure model + keyboard logic (public/tray-menu/tray-menu-core.js).
// Run from frontend/: node electron/trayMenu.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const M = require("./trayMenuModel.cjs");
const pageDir = join(here, "..", "public", "tray-menu");
const coreSrc = readFileSync(join(pageDir, "tray-menu-core.js"), "utf8");
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(coreSrc, ctx, { filename: "tray-menu-core.js" });
const C = ctx.DescallTrayCore;
const plain = (v) => JSON.parse(JSON.stringify(v));

// ---- 1. app state from the page ----------------------------------------------------------
{
  const s = M.normalizeAppState({
    signedIn: 1,
    name: "  Demir\u0000 ",
    avatarUrl: "javascript:alert(1)",
    status: "busy",
    unreadMessages: "12",
    friendRequests: -3,
    micMuted: "yes",
    hints: { mute: "Ctrl+Shift+M", deafen: "<img src=x>", clip: "Alt+F10" },
    theme: "light",
    accent: "88, 122, 245",
    locale: "pt-BR<",
    extra: "dropped",
  });
  assert.equal(s.name, "Demir", "control characters stripped, trimmed");
  assert.equal(s.avatarUrl, "", "only https / data:image avatars");
  assert.equal(s.status, "online", "unknown status -> online");
  assert.equal(s.unreadMessages, 12);
  assert.equal(s.friendRequests, 0);
  assert.equal(s.micMuted, true);
  assert.equal(s.hints.mute, "Ctrl+Shift+M");
  assert.equal(s.hints.deafen, "", "markup in a hint is dropped");
  assert.equal(s.theme, "light");
  assert.equal(s.accent, "88,122,245");
  assert.equal(s.locale, "pt-BR");
  assert.ok(!("extra" in s), "unknown keys never reach the panel");
  assert.equal(M.normalizeAppState({ avatarUrl: "https://api.descall.com/a.png" }).avatarUrl, "https://api.descall.com/a.png");
  assert.equal(M.normalizeAppState({ avatarUrl: "http://x/a.png" }).avatarUrl, "", "no plain http");
  assert.equal(M.normalizeAppState({ unreadMessages: 1e9 }).unreadMessages, 9999, "counts capped");
  assert.equal(M.normalizeAppState({ accent: "300,1,1" }).accent, "");
  assert.equal(M.normalizeAppState(null).status, "online");
  assert.ok(M.sameAppState(M.normalizeAppState({ name: "a" }), M.normalizeAppState({ name: "a" })));
}

// ---- 2. action allow list -----------------------------------------------------------------
{
  const v = (action, arg, opts) => M.validateAction({ action, arg }, opts);
  for (const a of ["open", "settings", "autostart", "quit", "update", "close", "mute", "deafen", "clip", "openDms", "openRequests"]) {
    assert.ok(v(a), `${a} allowed`);
  }
  assert.equal(v("eval"), null, "unknown action refused");
  assert.equal(v("__proto__"), null);
  assert.equal(v("toString"), null, "no prototype keys");
  assert.equal(M.validateAction("open"), null, "message must be an object");
  assert.deepEqual(plain(v("status", "dnd")), { action: "status", arg: "dnd", kind: "app", closes: true });
  assert.equal(v("status", "busy"), null);
  assert.equal(v("snooze", 30).arg, 30);
  assert.equal(v("snooze", 0).arg, 0, "0 turns the snooze off");
  assert.equal(v("snooze", 45), null, "only the offered durations");
  assert.equal(v("snooze", "480").arg, 480);
  assert.equal(v("ack", 7).arg, 7);
  assert.equal(v("ack", -1), null);
  assert.equal(v("ack", 1.5), null);
  const premiumIds = new Set(["p.0", "premium|focus|30"]);
  assert.equal(v("premium", "p.0", { premiumIds }).arg, "p.0");
  assert.equal(v("premium", "p.9", { premiumIds }), null, "only ids the panel was given");
  assert.equal(v("premium", "p.0"), null, "no ids known -> refused");
  assert.equal(v("mute").kind, "app");
  assert.equal(v("quit").kind, "shell");
  assert.equal(v("mute").closes, false, "toggles keep the panel open");
  assert.equal(v("autostart").closes, false);
  assert.equal(v("openDms").closes, true);
}

// ---- 3. notification snooze ---------------------------------------------------------------
{
  const now = 1_700_000_000_000;
  assert.equal(M.snoozeUntilFor(30, now), now + 30 * 60_000);
  assert.equal(M.snoozeUntilFor(480, now), now + 8 * 3_600_000);
  assert.equal(M.snoozeUntilFor(0, now), 0);
  assert.equal(M.snoozeUntilFor(5, now), 0);
  assert.equal(M.activeSnooze(now + 1000, now), now + 1000);
  assert.equal(M.activeSnooze(now - 1, now), 0, "expired");
  assert.equal(M.activeSnooze(now + 30 * 86_400_000, now), 0, "absurd values from a hand-edited file are ignored");
  assert.equal(M.suppressNotification({}, now + 1000, now), true);
  assert.equal(M.suppressNotification({ requireInteraction: true }, now + 1000, now), false, "incoming calls still ring");
  assert.equal(M.suppressNotification({}, 0, now), false);
}

// ---- 4. placement -------------------------------------------------------------------------
{
  const P = M.PANEL;
  const winW = P.pad + P.card + P.gap + P.flyout + P.pad;
  const work = { x: 0, y: 0, width: 1920, height: 1032 };
  // Bottom taskbar, icon near the right end: card hugs the right edge, flyout opens left.
  let p = M.placePanel({ tray: { x: 1780, y: 1040, width: 24, height: 32 }, work });
  assert.equal(p.edge, "bottom");
  assert.equal(p.flyout, "left");
  assert.equal(p.vertical, "bottom");
  assert.equal(p.width, winW);
  assert.equal(p.x + p.width, 1920, "window ends at the work area's right edge");
  assert.equal(p.y + p.height, 1032, "window sits on the taskbar");
  assert.equal(p.height, P.maxHeight);
  assert.equal(p.cardLeft, P.pad + P.flyout + P.gap);
  // Same numbers as the Rust port (descall_shell::tray_panel same_answers_as_the_electron_model).
  assert.deepEqual([p.x, p.y, p.width, p.height, p.cardLeft], [1364, 252, 556, 780, 252]);
  // Icon in the middle: card centred on it, flyout to the right.
  p = M.placePanel({ tray: { x: 950, y: 1040, width: 20, height: 32 }, work });
  assert.equal(p.flyout, "right");
  assert.equal(p.cardLeft, P.pad);
  assert.equal(p.x + p.cardLeft + P.card / 2, 960, "card centred on the icon");
  // Top taskbar.
  p = M.placePanel({ tray: { x: 1800, y: 0, width: 24, height: 40 }, work: { x: 0, y: 40, width: 1920, height: 1040 } });
  assert.equal(p.edge, "top");
  assert.equal(p.vertical, "top");
  assert.equal(p.y, 40);
  // Left taskbar: card at the left edge, bottom lined up with the icon, flyout right.
  p = M.placePanel({ tray: { x: 8, y: 980, width: 32, height: 24 }, work: { x: 48, y: 0, width: 1872, height: 1080 } });
  assert.equal(p.edge, "left");
  assert.equal(p.flyout, "right");
  assert.equal(p.x, 48);
  assert.equal(p.y + p.height - P.pad, 1004, "card bottom = icon bottom");
  // Right taskbar, icon near the top: the window cannot go above the work area.
  p = M.placePanel({ tray: { x: 1880, y: 10, width: 32, height: 24 }, work: { x: 0, y: 0, width: 1872, height: 1080 } });
  assert.equal(p.edge, "right");
  assert.equal(p.flyout, "left");
  assert.equal(p.y, 0);
  assert.equal(p.x + p.width, 1872);
  // Second monitor left of the primary (negative coordinates), 150 % scale in physical px.
  p = M.placePanel({ tray: { x: -300, y: 1580, width: 36, height: 48 }, work: { x: -2880, y: 0, width: 2880, height: 1572 }, scale: 1.5 });
  assert.equal(p.edge, "bottom");
  assert.ok(p.x >= -2880 && p.x + p.width <= 0, "inside the second monitor");
  assert.equal(p.width, Math.round(winW * 1.5));
  assert.equal(p.height, Math.round(P.maxHeight * 1.5));
  assert.equal(p.y + p.height, 1572);
  // Small work area: the window is clamped, never larger than the screen.
  p = M.placePanel({ tray: { x: 780, y: 600, width: 20, height: 30 }, work: { x: 0, y: 0, width: 800, height: 560 } });
  assert.ok(p.height <= 560 && p.x >= 0 && p.x + p.width <= 800);
  // Auto-hide taskbar (icon inside the work area, near the bottom).
  assert.equal(M.taskbarEdge({ x: 1700, y: 1050, width: 24, height: 24 }, { x: 0, y: 0, width: 1920, height: 1080 }), "bottom");
}

// ---- 5. Descall+ menu templates -----------------------------------------------------------
{
  let clicked = null;
  const { items, handlers } = M.serializeMenuTemplate([
    { type: "separator" },
    { label: "In a call: Ada", enabled: false },
    { id: "premium-call-mute", label: "Mute", click: () => {} },
    { label: "Leave call", click: () => { clicked = "leave"; } },
    { type: "separator" },
    { type: "separator" },
    { id: "premium-status", label: "Status", submenu: [{ label: "Online", type: "radio", checked: true, click: () => {} }] },
    { label: "Focus mode", submenu: [{ label: "30 minutes", click: () => { clicked = "focus30"; } }, { type: "separator" }, { label: "End", enabled: false, click: () => {} }] },
    { label: "Profile", submenu: [] },
    { type: "separator" },
  ]);
  assert.deepEqual(plain(items).map((i) => i.type), ["item", "item", "separator", "submenu"], "duplicates, empty submenus and stray separators dropped");
  assert.equal(items[0].enabled, false);
  assert.equal(items[3].items.length, 3);
  assert.equal(items[3].items[2].enabled, false);
  assert.ok(handlers.has(items[1].id) && !handlers.has(items[0].id));
  handlers.get(items[3].items[0].id).click();
  assert.equal(clicked, "focus30");
}

// ---- 6. panel rows ------------------------------------------------------------------------
const strings = JSON.parse(readFileSync(join(here, "i18n", "en.json"), "utf8")).tray;
const trStrings = { ...strings, ...JSON.parse(readFileSync(join(here, "i18n", "tr.json"), "utf8")).tray };
function state(app = {}, shell = {}, extra = {}) {
  return {
    strings,
    app: { signedIn: true, name: "Demir", status: "online", unreadMessages: 0, friendRequests: 0, hints: {}, ...app },
    shell: { version: "4.0.1", updateVersion: "", autostart: false, snoozeUntil: 0, ...shell },
    premium: [],
    placement: { flyout: "left" },
    ...extra,
  };
}
const ids = (m) => plain(m.rows.map((r) => r.kind === "separator" ? "|" : r.id));
{
  const now = 1_700_000_000_000;
  let m = C.buildModel(state(), now);
  assert.deepEqual(ids(m), ["open", "status", "snooze", "|", "mute", "deafen", "voice-note", "|", "messages", "requests", "|", "autostart", "settings", "quit"]);
  assert.equal(m.header.version, "v4.0.1");
  assert.equal(m.header.initial, "D");
  assert.equal(C.findRow(m.rows, "status").label, "Status: Online");
  assert.equal(C.findRow(m.rows, "status").children.find((c) => c.checked).id, "status:online");
  assert.equal(C.findRow(m.rows, "quit").action.action, "quit");
  assert.equal(C.findRow(m.rows, "mute").label, "Mute microphone");
  assert.equal(C.findRow(m.rows, "mute").dim, true, "out of a call the voice rows look disabled");
  assert.equal(C.findRow(m.rows, "messages").badge, null);

  m = C.buildModel(state(
    { inCall: true, micMuted: true, deafened: true, unreadMessages: 120, friendRequests: 3, clipAvailable: true, hints: { clip: "Alt+F10" }, status: "dnd" },
    { updateVersion: "4.0.2", autostart: true, snoozeUntil: now + 25 * 60_000 },
    { premium: [{ type: "item", id: "p.0", label: "Leave call", enabled: true }, { type: "separator" }, { type: "submenu", id: "p.2", label: "Focus mode", items: [{ type: "item", id: "p.2.0", label: "30 minutes" }] }] },
  ), now);
  assert.equal(m.rows[0].kind, "banner");
  assert.equal(m.rows[0].label, "Update ready · v4.0.2");
  assert.equal(C.findRow(m.rows, "quit").label, "Update and quit (v4.0.2)");
  assert.equal(C.findRow(m.rows, "quit").action.action, "update", "same path as the tray's Update and quit");
  assert.equal(C.findRow(m.rows, "mute").label, "Unmute microphone");
  assert.equal(C.findRow(m.rows, "deafen").label, "Undeafen");
  assert.ok(!C.findRow(m.rows, "voice-note"), "no note in a call");
  assert.equal(C.findRow(m.rows, "clip").hint, "Alt+F10");
  assert.equal(C.findRow(m.rows, "messages").badge.text, "99+");
  assert.equal(C.findRow(m.rows, "messages").badge.tone, "red");
  assert.equal(C.findRow(m.rows, "requests").badge.tone, "accent");
  assert.equal(C.findRow(m.rows, "snooze").sub, "25 min left");
  assert.equal(C.findRow(m.rows, "snooze").children.find((c) => c.id === "snooze:0").enabled, true);
  assert.equal(C.findRow(m.rows, "autostart").checked, true);
  assert.ok(C.findRow(m.rows, "premium-group"), "Descall+ entries get their own group");
  assert.deepEqual(plain(C.findRow(m.rows, "premium:p.0").action), { action: "premium", arg: "p.0" });
  assert.equal(C.findRow(m.rows, "premium:p.2").children[0].action.arg, "p.2.0");

  // Signed out (login screen): no status, voice or chat rows.
  m = C.buildModel(state({ signedIn: false }), now);
  assert.deepEqual(ids(m), ["open", "snooze", "|", "autostart", "settings", "quit"]);
  // Turkish wording.
  m = C.buildModel({ ...state({ status: "idle" }), strings: trStrings }, now);
  assert.equal(C.findRow(m.rows, "status").label, "Durum: Boşta");
  assert.equal(C.findRow(m.rows, "snooze").label, "Bildirimleri sustur");
  assert.equal(C.formatRemaining(7 * 3_600_000 + 59 * 60_000, trStrings), "7 sa 59 dk");
  assert.equal(C.formatRemaining(3_600_000, trStrings), "1 sa");
  assert.equal(C.formatRemaining(20_000, trStrings), "1 dk", "seconds round up to a minute");
  assert.equal(C.badgeText(0), "");
  assert.equal(C.badgeText(99), "99");
  assert.equal(C.initialOf("  ayşe"), "A");
  assert.equal(C.initialOf(""), "D");

  // Every text the page asks for exists in every catalog.
  const used = new Set([...coreSrc.matchAll(/tr\(S, "(\w+)"/g)].map((x) => x[1]));
  for (const s of C.STATUSES) used.add(s);
  for (const k of ["menuLabel", "version", "startAtLogin", "startWithWindows", "remainMin", "remainHour", "remainHourMin"]) used.add(k);
  for (const id of ["en", "tr", "de", "es", "fr", "pt-BR", "ru"]) {
    const cat = JSON.parse(readFileSync(join(here, "i18n", `${id}.json`), "utf8")).tray;
    for (const k of used) assert.ok(typeof cat[k] === "string" && cat[k].trim(), `${id}: tray.${k}`);
    assert.ok(cat.updateReady.includes(" · "), `${id}: the banner splits the title from the version at " · "`);
  }
}

// ---- 7. keyboard model --------------------------------------------------------------------
{
  const m = C.buildModel(state({ status: "idle" }, { updateVersion: "4.0.2" }), Date.now());
  const ctx = { rows: m.rows, flyout: "right" };
  let nav = { focus: null, open: null, sub: null };
  const press = (key, c = ctx) => {
    const r = C.reduceKey(nav, key, c);
    nav = r.nav;
    return r;
  };
  press("ArrowDown");
  assert.equal(nav.focus, "update", "first stop is the update button");
  press("ArrowUp");
  assert.equal(nav.focus, "quit", "wraps to the last row");
  press("Home");
  assert.equal(nav.focus, "update");
  press("End");
  assert.equal(nav.focus, "quit");
  let r = press("Enter");
  assert.equal(r.activate, "quit");
  press("Home");
  press("ArrowDown");
  press("ArrowDown");
  assert.equal(nav.focus, "status");
  r = press("ArrowRight");
  assert.equal(nav.open, "status");
  assert.equal(nav.sub, "status:idle", "submenu opens on the checked entry");
  press("ArrowDown");
  assert.equal(nav.sub, "status:dnd");
  press("End");
  assert.equal(nav.sub, "status:invisible");
  press("ArrowDown");
  assert.equal(nav.sub, "status:online", "wraps inside the submenu");
  r = press(" ");
  assert.equal(r.activate, "status:online", "Space activates");
  press("ArrowLeft");
  assert.equal(nav.open, null, "Left closes the submenu");
  assert.equal(nav.focus, "status", "focus goes back to its row");
  press("Enter");
  assert.equal(nav.open, "status", "Enter opens a submenu");
  r = press("Escape");
  assert.equal(nav.open, null);
  assert.equal(r.close, false, "first Escape only closes the submenu");
  r = press("Escape");
  assert.equal(r.close, true, "second Escape closes the panel");
  // Flyout on the left: Left also opens, Right closes.
  nav = { focus: "snooze", open: null, sub: null };
  press("ArrowLeft", { ...ctx, flyout: "left" });
  assert.equal(nav.open, "snooze");
  assert.equal(nav.sub, "snooze:30", "the disabled 'turn off' entry is skipped");
  press("ArrowUp", { ...ctx, flyout: "left" });
  assert.equal(nav.sub, "snooze:480", "disabled entries are not focusable");
  press("ArrowRight", { ...ctx, flyout: "left" });
  assert.equal(nav.open, null);
  // Tab / Shift+Tab move like the arrows; unknown keys are not handled.
  nav = { focus: "open", open: null, sub: null };
  press("Tab");
  assert.equal(nav.focus, "status");
  press("Shift+Tab");
  assert.equal(nav.focus, "open");
  assert.equal(press("x").handled, false);
  // Type-ahead.
  assert.equal(C.typeahead(m.rows, "open", "s"), "status");
  assert.equal(C.typeahead(m.rows, "status", "s"), "autostart", "next match after the focused row (Start with Windows)");
  assert.equal(C.typeahead(m.rows, "autostart", "S"), "settings", "case-insensitive");
  assert.equal(C.typeahead(m.rows, null, "z"), null);
  // Flyout stays inside the window.
  assert.equal(C.flyoutTop(500, 200, 600, 14), 386);
  assert.equal(C.flyoutTop(4, 200, 600, 14), 14);
  assert.equal(C.flyoutTop(100, 200, 600, 14), 94);
}

// ---- 8. the page itself -------------------------------------------------------------------
{
  const html = readFileSync(join(pageDir, "tray-menu.html"), "utf8");
  const js = readFileSync(join(pageDir, "tray-menu.js"), "utf8");
  assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'none';[^"]*script-src 'self'/);
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), "no inline scripts");
  assert.ok(!/\son[a-z]+\s*=/i.test(html), "no inline event handlers");
  assert.ok(!/style\s*=/.test(html), "no inline styles (style-src 'self')");
  assert.match(html, /role="menu"/);
  const htmlWrites = [...js.matchAll(/innerHTML\s*=[^;]*;/g)].map((x) => x[0]);
  assert.deepEqual(htmlWrites, ["innerHTML = body;"], "innerHTML only for the static icon table");
  assert.ok(!/setInterval\([^)]*,\s*\d{1,3}\)/.test(js), "no fast timers in the page");
  const css = readFileSync(join(pageDir, "tray-menu.css"), "utf8");
  assert.ok(!/animation[^;]*infinite/.test(css), "no infinite animation (idle CPU)");
}

// ---- 9. Electron wiring -------------------------------------------------------------------
{
  const main = readFileSync(join(here, "main.cjs"), "utf8");
  const win = readFileSync(join(here, "trayMenuWindow.cjs"), "utf8");
  const preload = readFileSync(join(here, "trayMenuPreload.cjs"), "utf8");
  assert.match(main, /trustedOn\('tray:set-state', \(event, raw\) => \{\s*if \(!mainWindow \|\| mainWindow\.isDestroyed\(\) \|\| event\.sender !== mainWindow\.webContents\) return;/, "only the main window sets the tray state");
  assert.match(main, /trayModel\.normalizeAppState\(raw\)/);
  assert.match(main, /suppressNotification\(options, notifSnoozeUntil/, "the snooze gates desktop cards");
  assert.match(main, /if \(trayPanel && trayPanel\.open\(bounds\)\) return;\s*try \{ tray\.popUpContextMenu\(buildMenu\(\)\); \}/, "native menu when the panel cannot open");
  assert.match(main, /onFail: \(\) => \{\s*try \{ tray\?\.popUpContextMenu\(buildMenu\(\)\); \}/, "native menu when the panel fails to load");
  assert.match(main, /if \(!trayPanel\) tray\.setContextMenu\(buildMenu\(\)\);/, "no context menu attached while the panel handles right click");
  // The panel window: own preload, sandbox, no navigation, sender checked, allow list.
  assert.match(win, /preload: path\.join\(__dirname, 'trayMenuPreload\.cjs'\)/);
  assert.match(win, /sandbox: true/);
  assert.match(win, /contextIsolation: true/);
  assert.match(win, /nodeIntegration: false/);
  assert.match(win, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(win, /'will-navigate', \(e\) => e\.preventDefault\(\)/);
  assert.match(win, /function act\(event, msg\) \{\s*if \(!isPanelSender\(event\)\) return;\s*const v = validateAction\(msg, \{ premiumIds \}\);/);
  assert.match(win, /function getState\(event\) \{\s*if \(!isPanelSender\(event\)\) throw/);
  assert.match(win, /ipcMain\.on\('tray-menu:act', \(event, msg\) => \{\s*for \(const p of panels\) if \(p\.owns\(event\)\) return p\.act\(event, msg\);/, "only the panel that owns the sender answers");
  assert.match(win, /return alive\(\) && event && event\.sender === win\.webContents && \(!event\.senderFrame \|\| event\.senderFrame === win\.webContents\.mainFrame\)/, "top frame of the panel window only");
  assert.deepEqual([...preload.matchAll(/ipcRenderer\.(\w+)\('([\w:-]+)'/g)].map((x) => `${x[1]} ${x[2]}`).sort(),
    ["invoke tray-menu:get-state", "on tray-menu:state", "removeListener tray-menu:state", "send tray-menu:act"], "the panel preload exposes three calls only");
}

console.log("trayMenu.selftest ok");
