// Chromium harness for the Tauri shell pages of the notification / tray area:
//  - the notification capsule (descall-shell://localhost/notif.html, shell-notif.js +
//    the runtime of desktop/crates/descall-shell/src/pages.rs, read from that file, so the
//    page is the one the Rust shell serves);
//  - the tray panel (frontend/public/tray-menu, tray-menu-shim.js).
// Each page gets a fake window.__TAURI_INTERNALS__ / window.__TAURI__ that records invoke()
// calls and can emit events, the way Tauri 2 injects them before the page scripts.
// No network: every host but the two fake origins is refused.
//
// Run: node desktop/app/shim/shell-pages.e2e.mjs   (needs Playwright + Chromium)
//      SHOTS=<dir> also writes screenshots.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch (_) {
  try { playwright = require(join(repo, "frontend", "node_modules", "playwright")); } catch (_) { /* below */ }
}
if (!playwright) {
  console.log("shell-pages.e2e: skipped (no playwright)");
  process.exit(0);
}
const SHOTS = process.env.SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// ---- the shell page server of pages.rs, rebuilt from its source ---------------------------------
const pagesRs = readFileSync(join(repo, "desktop", "crates", "descall-shell", "src", "pages.rs"), "utf8");
const read = (p) => readFileSync(join(repo, p), "utf8");

/** Rust format! string -> JS string with the named arguments filled in. */
function rustFormat(tpl, args) {
  return tpl.replace(/\{\{|\}\}|\{(\w+)\}/g, (m, name) => {
    if (m === "{{") return "{";
    if (m === "}}") return "}";
    if (!(name in args)) throw new Error(`format arg missing: ${name}`);
    return args[name];
  });
}

function runtimeJs() {
  const m = pagesRs.match(/format!\(\s*r#"([\s\S]*?)"#,/);
  assert.ok(m, "runtime template in pages.rs");
  const locales = ["en", "tr", "de", "es", "fr", "pt-BR", "ru"];
  const files = { "/src/i18n/locales.json": read("frontend/src/i18n/locales.json") };
  for (const id of locales) files[`/electron/i18n/${id}.json`] = read(`frontend/electron/i18n/${id}.json`);
  return rustFormat(m[1], {
    files: JSON.stringify(files),
    icon: JSON.stringify(readFileSync(join(repo, "frontend", "electron", "descall-icon.png")).toString("base64")),
    main_i18n: read("frontend/electron/mainI18n.cjs"),
    card: read("frontend/electron/notificationCard.cjs"),
    overlay: read("frontend/electron/overlayHtml.cjs"),
  });
}

function pageHtml(script) {
  const m = pagesRs.match(/fn page\(script: &str\) -> String \{\s*format!\(\s*"([\s\S]*?)"\s*\)/);
  assert.ok(m, "page() template in pages.rs");
  // Rust string escapes used there: \" and a trailing \ line continuation.
  const tpl = m[1].replace(/\\\r?\n\s*/g, "").replace(/\\"/g, '"');
  return rustFormat(tpl, { script });
}
// pub const CSP: &str = concat!("...", shell_img_src!(), "..."): rebuilt from the macro.
const IMG_SRC = pagesRs.match(/macro_rules! shell_img_src \{\s*\(\) => \{\s*"([^"]+)"/)[1];
const CSP = [...pagesRs.match(/pub const CSP: &str = concat!\(([\s\S]+?)\);\n/)[1].matchAll(/"((?:[^"\\]|\\.)*)"|shell_img_src!\(\)/g)]
  .map((m) => (m[1] === undefined ? IMG_SRC : JSON.parse(`"${m[1]}"`))).join("");
assert.ok(CSP.startsWith("default-src 'none';") && CSP.includes(`img-src ${IMG_SRC};`), `shell CSP parsed: ${CSP}`);
const SHELL_ORIGIN = "https://descall-shell.localhost";
const APP_ORIGIN = "https://tauri.localhost";
const SHELL_FILES = {
  "/notif.html": ["text/html; charset=utf-8", () => pageHtml("notif.js")],
  "/runtime.js": ["text/javascript; charset=utf-8", runtimeJs],
  "/notif.js": ["text/javascript; charset=utf-8", () => read("desktop/app/shim/shell-notif.js")],
  "/overlay.html": ["text/html; charset=utf-8", () => pageHtml("overlay.js")],
  "/overlay.js": ["text/javascript; charset=utf-8", () => read("desktop/app/shim/shell-overlay.js")],
};

// ---- fake Tauri bridge (init script, runs before any page script) --------------------------------
function fakeTauri({ label, responses = {} }) {
  /* global window */
  const calls = [];
  const handlers = {};
  const invoke = (cmd, args) => {
    calls.push([cmd, args === undefined ? null : JSON.parse(JSON.stringify(args))]);
    if (cmd === "plugin:event|listen") return Promise.resolve(1);
    return Promise.resolve(Object.prototype.hasOwnProperty.call(responses, cmd) ? responses[cmd] : null);
  };
  window.__calls = calls;
  window.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label }, currentWebview: { label } }, invoke, transformCallback: () => 1 };
  window.__TAURI__ = {
    core: { invoke },
    event: {
      listen: (event, fn) => {
        (handlers[event] = handlers[event] || []).push(fn);
        return Promise.resolve(() => { handlers[event] = (handlers[event] || []).filter((h) => h !== fn); });
      },
      emit: () => Promise.resolve(),
    },
  };
  window.__emit = (event, payload) => (handlers[event] || []).forEach((h) => h({ event, payload }));
  window.__listening = (event) => (handlers[event] || []).length;
}

const browser = await playwright.chromium.launch({
  args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE descall-shell.localhost, EXCLUDE tauri.localhost"],
});
const failures = [];
async function newPage({ width, height, init, label, responses }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: "dark" });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === SHELL_ORIGIN && SHELL_FILES[url.pathname]) {
      const [type, body] = SHELL_FILES[url.pathname];
      return route.fulfill({ status: 200, contentType: type, headers: { "Content-Security-Policy": CSP }, body: body() });
    }
    if (url.origin === APP_ORIGIN && url.pathname.startsWith("/tray-menu/")) {
      const file = join(repo, "frontend", "public", url.pathname);
      const type = url.pathname.endsWith(".css") ? "text/css" : url.pathname.endsWith(".js") ? "text/javascript" : "text/html";
      try { return route.fulfill({ status: 200, contentType: type, body: readFileSync(file) }); } catch (_) { return route.fulfill({ status: 404, body: "" }); }
    }
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(fakeTauri, { label, responses });
  for (const s of init) await page.addInitScript(s);
  return { page, context, errors };
}
const calls = (page) => page.evaluate(() => window.__calls.filter((c) => !String(c[0]).startsWith("plugin:")));
async function waitCall(page, cmd, pred = () => true, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) {
    const hit = (await calls(page)).find((c) => c[0] === cmd && pred(c[1] || {}));
    if (hit) return hit[1];
    if (Date.now() > end) throw new Error(`no ${cmd} call; got ${JSON.stringify(await calls(page))}`);
    await page.waitForTimeout(40);
  }
}
async function step(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`FAIL ${name}\n     ${String(err && err.stack || err).split("\n").slice(0, 4).join("\n     ")}`);
  }
}

// ---- notification capsule ---------------------------------------------------------------------------
async function capsule(input, size = { width: 536, height: 122 }) {
  const init = [`window.__DESCALL_NOTIF__ = ${JSON.stringify({ locale: "tr", count: 1, ...input })};`];
  const p = await newPage({ ...size, init, label: "notif-1" });
  await p.page.goto(`${SHELL_ORIGIN}/notif.html`);
  await p.page.waitForSelector(".card");
  // Spring entrance settles in well under a second.
  await p.page.waitForTimeout(450);
  return p;
}

await step("capsule: DM renders name, preview and the notifAPI bridge", async () => {
  const { page, context, errors } = await capsule({ title: "Ayşe", body: "selam, akşam geliyor musun?", data: { type: "dm", from: "Ayşe", fromId: "u1", conversationId: "u1" }, type: "default", duration: 5000 });
  assert.equal(await page.textContent(".title-text"), "Ayşe");
  assert.match(await page.textContent(".body-text"), /selam, akşam/);
  assert.equal(await page.getAttribute(".card", "data-duration"), "5000");
  const api = await page.evaluate(() => Object.keys(window.notifAPI).sort());
  deepKeys(api);
  assert.equal(await page.evaluate(() => window.__listening("notif:update")), 1, "listens for grouped updates");
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "capsule-dm.png") });
  assert.deepEqual(errors, []);
  await context.close();
});

await step("capsule: avatars load from the app's image hosts only (CSP img-src)", async () => {
  const attempt = async (avatarUrl) => {
    const { page, context } = await capsule({ title: "Ayşe", body: "selam", avatarUrl, data: { type: "dm", from: "Ayşe" }, duration: 5000 });
    // Requests that reach the network layer (CSP-blocked ones never do).
    const requested = [];
    await page.route("**/*", (r) => { requested.push(r.request().url()); return r.fallback(); });
    const blocked = await page.evaluate((u) => new Promise((resolve) => {
      document.addEventListener("securitypolicyviolation", (e) => resolve(e.blockedURI), { once: true });
      const img = new Image();
      img.onerror = () => setTimeout(() => resolve(null), 300);
      img.src = u;
    }), avatarUrl);
    await context.close();
    return { blocked, requested };
  };
  // Any https host used to load (img-src https:): the always-on-top capsule told that host the
  // viewer's address for an avatar the main window refuses.
  const foreign = await attempt("https://tracker.example/a.png");
  assert.equal(foreign.blocked, "https://tracker.example/a.png", "foreign avatar host blocked by CSP");
  assert.ok(!foreign.requested.some((u) => u.startsWith("https://tracker.example")), `never requested: ${JSON.stringify(foreign.requested)}`);
  const own = await attempt("https://abc.supabase.co/storage/v1/object/public/avatars/a.png");
  assert.equal(own.blocked, null, "the app's own image host is allowed");
  assert.ok(own.requested.some((u) => u.startsWith("https://abc.supabase.co/")), "own host requested");
});

function deepKeys(api) {
  // Same members as frontend/electron/notifPreload.cjs.
  const src = read("frontend/electron/notifPreload.cjs");
  const keys = [...src.matchAll(/^\s{2}(\w+):\s/gm)].map((m) => m[1]).sort();
  assert.deepEqual(api, keys, "notifAPI keys = notifPreload.cjs");
}

await step("capsule: hover pauses, leaving resumes with the time left, click opens the chat", async () => {
  const { page, context } = await capsule({ title: "Ayşe", body: "selam", data: { type: "dm", from: "Ayşe" }, duration: 5000 });
  await page.hover(".card .body-text");
  await waitCall(page, "notif_action", (a) => a.action === "pause");
  await page.waitForTimeout(300);
  await page.mouse.move(2, 2);
  const resume = await waitCall(page, "notif_action", (a) => a.action === "resume");
  assert.ok(resume.remaining > 3000 && resume.remaining <= 5000, `remaining ${resume.remaining}`);
  await page.click(".card .body-text");
  await waitCall(page, "notif_action", (a) => a.action === "click");
  await context.close();
});

await step("capsule: close button sends close, not click", async () => {
  const { page, context } = await capsule({ title: "Ayşe", body: "selam", data: { type: "dm", from: "Ayşe" }, duration: 5000 });
  await page.click("[data-act=close]");
  await waitCall(page, "notif_action", (a) => a.action === "close");
  assert.ok(!(await calls(page)).some((c) => c[1] && c[1].action === "click"));
  await context.close();
});

await step("capsule: times out by itself (close)", async () => {
  const { page, context } = await capsule({ title: "Ayşe", body: "selam", data: { type: "dm", from: "Ayşe" }, duration: 600 });
  await waitCall(page, "notif_action", (a) => a.action === "close", 3000);
  await context.close();
});

await step("capsule: grouped update (notif:update) changes text and count chip", async () => {
  const { page, context, errors } = await capsule({ title: "Hafta Sonu Ekibi", body: "Mert: ilk", data: { type: "group", groupId: "g1", groupName: "Hafta Sonu Ekibi", from: "Mert", preview: "ilk" }, duration: 5000 });
  assert.equal(await page.textContent(".count"), "");
  // Payload exactly as commands/notify.rs emits it.
  await page.evaluate(() => window.__emit("notif:update", { title: "Hafta Sonu Ekibi", body: "Zeynep: ikinci", data: { type: "group", groupId: "g1", groupName: "Hafta Sonu Ekibi", from: "Zeynep", preview: "ikinci" }, avatarUrl: null, count: 2 }));
  await page.waitForTimeout(80);
  assert.equal(await page.textContent(".count"), "2");
  assert.match(await page.textContent(".body-text"), /ikinci/);
  assert.match(await page.textContent(".title-text"), /Zeynep/);
  assert.deepEqual(errors, []);
  await context.close();
});

await step("capsule: incoming call has accept / decline, no timeout", async () => {
  for (const act of ["accept", "decline"]) {
    const { page, context, errors } = await capsule({ title: "Ayşe arıyor", body: "Sesli arama", data: { type: "call", from: "Ayşe", fromId: "u1", callType: "voice" }, type: "call", duration: 0 });
    assert.equal(await page.getAttribute(".card", "data-duration"), "0");
    if (SHOTS && act === "accept") await page.screenshot({ path: join(SHOTS, "capsule-call.png") });
    await page.click(`[data-act=${act}]`);
    await waitCall(page, "notif_action", (a) => a.action === act);
    // A click on the card itself must not answer the call.
    assert.ok(!(await calls(page)).some((c) => c[1] && c[1].action === "click"));
    assert.deepEqual(errors, []);
    await context.close();
  }
});

await step("capsule: friend online 'Mesaj' pill clicks through, app icon shown", async () => {
  const { page, context, errors } = await capsule({ title: "Descall", body: "Mert çevrimiçi", data: { type: "friend-online", username: "Mert", userId: "u2" }, appIcon: true, duration: 5000 });
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "capsule-online.png") });
  await page.click("[data-act=click]");
  await waitCall(page, "notif_action", (a) => a.action === "click");
  assert.deepEqual(errors, []);
  await context.close();
});

await step("capsule: every locale renders (shell language)", async () => {
  for (const locale of ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]) {
    const { page, context, errors } = await capsule({ locale, title: "x", body: "y", data: { type: "call", from: "Ada" }, type: "call", duration: 0 });
    const label = await page.getAttribute("[data-act=accept]", "aria-label");
    assert.ok(label && label.length > 1, `${locale}: accept label`);
    assert.deepEqual(errors, [], locale);
    await context.close();
  }
});

// ---- in-call mini card (overlay-<n>, commands/overlay.rs) ---------------------------------------------
// Round 2: the card the shell shows during a call, outside the app. Size as overlay.rs builds it
// (WIDTH 308, HEIGHT 136).
async function miniCard(locale = "tr") {
  const init = [`window.__DESCALL_OVERLAY__ = ${JSON.stringify({ locale })};`];
  const p = await newPage({ width: 308, height: 136, init, label: "overlay-3" });
  await p.page.goto(`${SHELL_ORIGIN}/overlay.html`);
  await p.page.waitForSelector("#card");
  return p;
}
// Payload as overlay.rs pushes it (merge() of useElectronOverlay's overlayShow payload).
const ovState = (over = {}) => ({ title: "Ayşe", muted: false, deafened: false, connected: true, pending: false, kind: "dm", since: Date.now() - 65000, lang: "tr", avatarUrl: "", brandRgb: "", ...over });

await step("mini card: overlayAPI bridge, state push renders title and call time", async () => {
  const { page, context, errors } = await miniCard();
  // Same members as frontend/electron/overlayPreload.cjs.
  const pre = read("frontend/electron/overlayPreload.cjs");
  const keys = [...pre.matchAll(/^\s{2,4}(\w+):\s*(?:\(|function)/gm)].map((m) => m[1]).sort();
  assert.deepEqual(await page.evaluate(() => Object.keys(window.overlayAPI).sort()), keys, "overlayAPI keys = overlayPreload.cjs");
  await page.evaluate((st) => window.__overlayUpdate(st), ovState());
  await page.waitForTimeout(60);
  assert.equal(await page.textContent("#title"), "Ayşe");
  assert.match(await page.textContent("#status"), /1:0\d/, "call time from since");
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "mini-card.png") });
  assert.deepEqual(errors, []);
  await context.close();
});

await step("mini card: mute / deafen / leave reach the shell (overlay_action), buttons outside the drag row", async () => {
  const { page, context, errors } = await miniCard();
  await page.evaluate((st) => window.__overlayUpdate(st), ovState());
  // WebView2 turns app-region: drag into a caption (HTCAPTION) that swallows clicks (round 1
  // bug class): no button may sit inside a drag region.
  const inDrag = await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => {
    for (let el = b; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      const r = cs.getPropertyValue("app-region") || cs.getPropertyValue("-webkit-app-region");
      if (r === "drag") return true;
      if (r === "no-drag") return false;
    }
    return false;
  }).map((b) => b.id));
  assert.deepEqual(inDrag, [], "buttons inside a drag region");
  for (const [id, act] of [["#muteBtn", "mute"], ["#deafenBtn", "deafen"], ["#leaveBtn", "leave"]]) {
    await page.click(id);
    await waitCall(page, "overlay_action", (a) => a.action === act);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

await step("mini card: every locale labels its buttons (shell language)", async () => {
  for (const locale of ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]) {
    const { page, context, errors } = await miniCard(locale);
    await page.evaluate((st) => window.__overlayUpdate(st), ovState({ lang: "en" }));
    const labels = await page.evaluate(() => ["muteBtn", "deafenBtn", "leaveBtn"].map((id) => document.getElementById(id).getAttribute("aria-label") || document.getElementById(id).title || ""));
    assert.ok(labels.every((l) => l.length > 1), `${locale}: ${JSON.stringify(labels)}`);
    assert.deepEqual(errors, [], locale);
    await context.close();
  }
});

// ---- tray panel -----------------------------------------------------------------------------------------
const trayStrings = JSON.parse(read("frontend/electron/i18n/tr.json")).tray;
function trayState(over = {}) {
  return {
    seq: 1,
    openSeq: 1,
    lang: "tr",
    strings: trayStrings,
    app: {
      signedIn: true, name: "Demir", avatarUrl: "", status: "online", statusUntil: 0, statusText: "",
      unreadMessages: 3, friendRequests: 1, micMuted: false, deafened: false, inCall: true, clipAvailable: false,
      notificationsMutedUntil: 0, hints: { open: "", mute: "", deafen: "", clip: "" }, theme: "dark", accent: "", locale: "tr",
      ...(over.app || {}),
    },
    shell: { version: "4.1.0", updateVersion: "", autostart: true, autostartKey: "startWithWindows", snoozeUntil: 0, ...(over.shell || {}) },
    premium: over.premium || [],
    placement: { cardLeft: 14, vertical: "bottom", flyout: "left", pad: 14, gap: 6, card: 290, flyoutWidth: 232 },
    ...(over.top || {}),
  };
}
async function trayPage(state) {
  const p = await newPage({ width: 542, height: 780, init: [read("desktop/app/shim/tray-menu-shim.js")], label: "tray-menu", responses: { tray_menu_state: state } });
  await p.page.goto(`${APP_ORIGIN}/tray-menu/tray-menu.html`);
  await p.page.waitForSelector("#card [role=menuitem], #card [role=menuitemcheckbox], #card [role=menuitemradio]", { timeout: 4000 });
  return p;
}
const acts = async (page) => (await calls(page)).filter((c) => c[0] === "tray_menu_act").map((c) => c[1]);

await step("tray: panel loads its state, acknowledges it and shows name, unread, call rows", async () => {
  const { page, context, errors } = await trayPage(trayState());
  const ack = await waitCall(page, "tray_menu_act", (a) => a.action === "ack");
  assert.equal(ack.arg, 1, "ack carries the state seq");
  const text = await page.textContent("#card");
  assert.match(text, /Demir/);
  assert.match(text, /3/, "unread count");
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "tray-panel.png") });
  assert.deepEqual(errors, []);
  await context.close();
});

await step("tray: mute, deafen, open, quit reach tray_menu_act", async () => {
  const { page, context } = await trayPage(trayState());
  await waitCall(page, "tray_menu_act", (a) => a.action === "ack");
  const rowIds = await page.$$eval("#card [data-id]", (els) => els.map((e) => e.getAttribute("data-id")));
  for (const id of ["mute", "deafen"]) {
    assert.ok(rowIds.includes(id), `row ${id} in ${rowIds.join(",")}`);
    await page.click(`#card [data-id="${id}"]`);
    await waitCall(page, "tray_menu_act", (a) => a.action === id);
  }
  for (const id of ["open", "quit"]) {
    assert.ok(rowIds.includes(id), `row ${id}`);
  }
  await page.click('#card [data-id="quit"]');
  await waitCall(page, "tray_menu_act", (a) => a.action === "quit");
  await context.close();
});

await step("tray: status flyout sets dnd, snooze sends minutes", async () => {
  const { page, context } = await trayPage(trayState());
  await waitCall(page, "tray_menu_act", (a) => a.action === "ack");
  const ids = await page.$$eval("#card [data-id]", (els) => els.map((e) => e.getAttribute("data-id")));
  const statusRow = ids.find((i) => /status/.test(i));
  assert.ok(statusRow, `status row in ${ids.join(",")}`);
  await page.hover(`#card [data-id="${statusRow}"]`);
  await page.click(`#card [data-id="${statusRow}"]`);
  await page.waitForSelector("#flyout:not([hidden]) [data-id]");
  const sub = await page.$$eval("#flyout [data-id]", (els) => els.map((e) => e.getAttribute("data-id")));
  const dnd = sub.find((i) => /dnd/.test(i));
  assert.ok(dnd, `dnd in ${sub.join(",")}`);
  await page.click(`#flyout [data-id="${dnd}"]`);
  await waitCall(page, "tray_menu_act", (a) => a.action === "status" && a.arg === "dnd");
  await context.close();

  const p2 = await trayPage(trayState());
  await waitCall(p2.page, "tray_menu_act", (a) => a.action === "ack");
  const ids2 = await p2.page.$$eval("#card [data-id]", (els) => els.map((e) => e.getAttribute("data-id")));
  const snoozeRow = ids2.find((i) => /snooze|notif/.test(i));
  assert.ok(snoozeRow, `snooze row in ${ids2.join(",")}`);
  await p2.page.click(`#card [data-id="${snoozeRow}"]`);
  await p2.page.waitForSelector("#flyout:not([hidden]) [data-id]");
  const sub2 = await p2.page.$$eval("#flyout [data-id]", (els) => els.map((e) => e.getAttribute("data-id")));
  await p2.page.click(`#flyout [data-id="${sub2[0]}"]`);
  const sn = await waitCall(p2.page, "tray_menu_act", (a) => a.action === "snooze");
  assert.ok([30, 60, 480].includes(Number(sn.arg)), `snooze ${sn.arg}`);
  await p2.context.close();
});

await step("tray: a pushed state (tray-menu:state) re-renders and is acknowledged", async () => {
  const { page, context } = await trayPage(trayState());
  await waitCall(page, "tray_menu_act", (a) => a.action === "ack" && a.arg === 1);
  const next = trayState({ app: { micMuted: true, unreadMessages: 12 }, top: { seq: 2 } });
  await page.evaluate((s) => window.__emit("tray-menu:state", s), next);
  await waitCall(page, "tray_menu_act", (a) => a.action === "ack" && a.arg === 2);
  assert.match(await page.textContent("#card"), /12/);
  await context.close();
});

await step("tray: Descall+ entries click through as premium ids", async () => {
  const premium = [{ type: "item", id: "premium|action|leave", label: "Aramadan ayrıl", enabled: true }];
  const { page, context } = await trayPage(trayState({ premium }));
  await waitCall(page, "tray_menu_act", (a) => a.action === "ack");
  const ids = await page.$$eval("[data-id]", (els) => els.map((e) => e.getAttribute("data-id")));
  const row = ids.find((i) => i.includes("premium"));
  assert.ok(row, `premium row in ${ids.join(",")}`);
  await page.click(`[data-id="${row}"]`);
  const got = await waitCall(page, "tray_menu_act", (a) => a.action === "premium");
  assert.equal(got.arg, "premium|action|leave");
  await context.close();
});

await browser.close();
if (failures.length) {
  console.log(`shell-pages.e2e: ${failures.length} failed: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("shell-pages.e2e: ok");
