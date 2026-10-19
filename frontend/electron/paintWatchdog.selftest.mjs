// 2.11.9: main-process paint watchdog + renderer boot reports + single-instance guard.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const w = require("./bootWatchdog.cjs");

const step = (o) => w.paintWatchdogStep({ painted: false, reloads: 0, asked: false, ...o });
assert.equal(step({ painted: true, elapsedMs: 99_000 }), "none");
assert.equal(step({ elapsedMs: 5_000 }), "none");
assert.equal(step({ elapsedMs: w.PAINT_NUDGE_MS }), "nudge");
assert.equal(step({ elapsedMs: w.PAINT_RELOAD_MS }), "reload");
assert.equal(step({ elapsedMs: w.PAINT_RELOAD_MS, reloads: w.MAX_PAINT_RELOADS }), "nudge", "only one automatic clean reload");
assert.equal(step({ elapsedMs: w.PAINT_ASK_MS, reloads: 1 }), "ask");
assert.equal(step({ elapsedMs: w.PAINT_ASK_MS, reloads: 1, asked: true }), "nudge");
assert.ok(w.PAINT_NUDGE_MS < w.PAINT_RELOAD_MS && w.PAINT_RELOAD_MS < w.PAINT_ASK_MS);
assert.ok(w.PAINT_RELOAD_MS > 14_000, "renderer's own 14s watchdog gets the first go");

assert.deepEqual(w.normalizeBootReport({ phase: "painted", ms: 812.4 }), { phase: "painted", ms: 812 });
assert.equal(w.normalizeBootReport({ phase: "rm -rf" }), null);
assert.equal(w.normalizeBootReport(null), null);
assert.deepEqual(w.normalizeBootReport({ phase: "app-mounted", ms: -1 }), { phase: "app-mounted", ms: null });

const main = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");
assert.match(main, /ipcMain\.on\('app:boot-state'[\s\S]*?event\.sender !== mainWindow\.webContents/, "boot reports only from the main window");
assert.match(main, /rendererBoot\.painted = true;[\s\S]*?webContents\.invalidate\(\)/, "fresh frame once the splash is gone");
assert.match(main, /win\.webContents\.on\('did-start-navigation'[\s\S]*?shouldArmPaintWatchdog\(nav\)[\s\S]*?paintWatchdogStep\(/);
// 2.13.1: did-start-loading fires for pushState too, so the watchdog re-armed on every in-app
// navigation and clean-reloaded the app 22 s later (Settings → Mağaza → Ülkeler).
assert.doesNotMatch(main, /on\('did-start-loading'[^)]*\)\s*=>\s*\{\s*\n\s*rendererBoot = \{ painted: false/, "the watchdog is not armed by did-start-loading");
assert.match(main, /appLooksPainted\(snap\)[\s\S]*?rendererBoot\.painted = true;[\s\S]*?step === 'reload'/, "an app that is up is never reloaded");
assert.equal(w.shouldArmPaintWatchdog({ isMainFrame: true, isSameDocument: false }), true, "new document boots again");
assert.equal(w.shouldArmPaintWatchdog({ isMainFrame: true, isSameDocument: true }), false, "pushState / router navigation");
assert.equal(w.shouldArmPaintWatchdog({ isMainFrame: false, isSameDocument: false }), false, "iframe load");
assert.equal(w.shouldArmPaintWatchdog({}), true, "unknown shape arms (old behaviour for a real load)");
const up = { splashes: 0, failed: "", hidden: "", rootChildren: 3, rootText: 10734, rootH: 859, vis: "visible", holds: 0, path: "/settings/shop", ready: "complete" };
assert.equal(w.appLooksPainted(up), true, "the exact snapshot main logged before the bad reload");
assert.equal(w.appLooksPainted(JSON.stringify(up)), true);
assert.equal(w.appLooksPainted({ ...up, splashes: 1 }), false, "splash still up");
assert.equal(w.appLooksPainted({ ...up, rootChildren: 0 }), false);
assert.equal(w.appLooksPainted({ ...up, rootText: 0 }), false);
assert.equal(w.appLooksPainted({ ...up, rootH: 20 }), false);
assert.equal(w.appLooksPainted("snapshot failed: x"), false);
assert.equal(w.appLooksPainted(null), false);
assert.match(main, /step === 'reload'[\s\S]*?clearAndReloadRenderer\(win\.webContents, 'paint-watchdog'\)/);
assert.match(main, /message: 'Descall açılamadı'[\s\S]*?buttons: \['Tekrar dene', 'Çıkış'\]/);
assert.match(main, /for \(const ev of \['show', 'restore', 'focus'\]\)[\s\S]*?invalidate\(\)/, "restore from minimized repaints");
assert.match(main, /win\.webContents\.on\('console-message'/, "renderer warnings reach main.log");
assert.match(main, /app\.whenReady\(\)\.then\(async \(\) => \{\s*\n(?:\s*\/\/.*\n)*\s*if \(!gotTheLock\) return;/, "lock loser never boots");

const preload = readFileSync(new URL("./preload.cjs", import.meta.url), "utf8");
assert.match(preload, /bootState: \(phase, ms\) => ipcRenderer\.send\('app:boot-state'/);

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.match(html, /function reportBoot\(phase\)/);
assert.match(html, /kickPaint\(\);\s*reportBoot\("painted"\);/, "painted is reported after the splash nodes are removed");
assert.match(html, /reportBoot\("splash-failed"\)/);
assert.match(html, /reportBoot\("auto-retry"\)/);
assert.match(html, /addEventListener\("visibilitychange"[\s\S]*?force: true/);

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.match(app, /reportBootPhase\("app-mounted"\)[\s\S]*?dismissBootSplashFromApp\([\s\S]*?if \(!document\.getElementById\("boot-splash"\)\) reportBootPhase\("painted"\)/);

const entry = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
assert.match(entry, /prefetchAppChunk\(\)\s*\.then\(\(\) => window\.setTimeout\(\(\) => clearModuleLoadRecovery\(\), 4000\)\)/, "module reload re-arms only after the App chunk loaded");
console.log("paintWatchdog selftest ok");
