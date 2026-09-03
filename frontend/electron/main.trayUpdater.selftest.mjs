/**
 * Guards the desktop window/updater contract that has regressed before:
 *   - the close button hides to the tray and never quits
 *   - taskbar/tray/notification/shortcut paths all restore + focus the window
 *   - minimize still minimizes (taskbar button kept)
 *   - updates poll on an interval and install quietly, without stealing focus
 *
 * Run: node frontend/electron/main.trayUpdater.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(root, "main.cjs"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ── close → tray, never quit ────────────────────────────────────────────────
const closeHandler = main.slice(
  main.indexOf("mainWindow.on('close'"),
  main.indexOf("// IPC handlers for window controls")
);
assert(closeHandler.length > 0, "close handler must exist");
assert(closeHandler.includes("e.preventDefault()"), "close must be intercepted, not allowed to destroy the window");
assert(closeHandler.includes("setSkipTaskbar(true)"), "close-to-tray must drop the taskbar button");
assert(closeHandler.includes("mainWindow.hide()"), "close must hide the window to the tray");
assert(closeHandler.includes("setStartInBackground(true, 'hidden')"), "close must remember the tray state for the next launch");
assert(!/app\.quit\(\)/.test(closeHandler), "close must never quit the app");
assert(closeHandler.includes("mainWindow.minimize()"), "with no tray icon, close must fall back to minimize so the window stays reachable");
assert(main.includes("app.on('window-all-closed'"), "window-all-closed must be handled (stay in tray)");

// ── one restore path used by every entry point ──────────────────────────────
const showFn = main.slice(main.indexOf("function showMainWindow()"), main.indexOf("// Discord-like update / boot splash"));
assert(showFn.includes("setSkipTaskbar(false)"), "restoring must bring the taskbar button back");
assert(showFn.includes("restore()"), "restoring must un-minimize");
assert(showFn.includes("mainWindow.show()"), "restoring must show the window");
assert(showFn.includes("moveTop()") && showFn.includes("focus()"), "restoring must raise and focus the window");
for (const entry of [
  "tray.on('click'",
  "tray.on('double-click'",
  "app.on('second-instance'",
  "ipcMain.handle('focus-window'",
]) {
  const at = main.indexOf(entry);
  assert(at > 0, `${entry} must exist`);
  assert(
    main.slice(at, at + 320).includes("showMainWindow()"),
    `${entry} must restore + focus through showMainWindow()`
  );
}
assert(
  main.slice(main.indexOf("onClick: () => {"), main.indexOf("onClick: () => {") + 200).includes("showMainWindow()"),
  "notification clicks must restore through showMainWindow()"
);

// ── minimize stays a minimize ──────────────────────────────────────────────
const minimizeHandler = main.slice(main.indexOf("mainWindow.on('minimize'"), main.indexOf("mainWindow.on('hide'"));
assert(minimizeHandler.includes("setSkipTaskbar(false)"), "minimize must keep the taskbar button");
assert(minimizeHandler.includes("'minimized'"), "minimize must be remembered as minimized, not tray-hidden");
assert(main.includes("ipcMain.on('window:minimize'"), "title bar minimize IPC must exist");

// ── auto-update: interval, quiet, no focus steal, session preserved ─────────
assert(/UPDATE_CHECK_INTERVAL_MS\s*=\s*5 \* 60 \* 1000/.test(main), "update checks must run on a 5 minute interval");
assert(main.includes("setInterval(() => checkForAppUpdates('interval-5m')"), "the interval poller must be armed while the app is open");
assert(main.includes("autoUpdater.autoDownload = true"), "updates must download automatically");
assert(main.includes("autoUpdater.autoInstallOnAppQuit = true"), "a staged update must also apply on quit");
const installer = main.slice(main.indexOf("function installQuietly"), main.indexOf("function checkForAppUpdates"));
assert(installer.includes("isBusyWithLiveSession()"), "a quiet install must never interrupt a live call");
assert(installer.includes("!isAppInBackground()"), "a quiet install must wait until the window is in the background");
assert(installer.includes("setStartInBackground(true, mode)"), "the post-install relaunch must come back backgrounded (no focus steal)");
assert(installer.includes("queueSilentInstallRetry()"), "a deferred install must retry instead of being dropped");
assert(main.includes("autoUpdater.quitAndInstall(true, true)"), "install must be silent + force-run-after");
assert(main.includes("backgroundThrottling: false"), "tray/minimized windows must keep sockets and the update poller alive");
assert(!/quitAndInstall[\s\S]{0,120}mainWindow\.(show|focus)/.test(main), "installing an update must not show or focus the window");

// ── right-click must not be hijacked by a DevTools popup ───────────────────
const ctx = main.slice(main.indexOf("mainWindow.webContents.on('context-menu'"), main.indexOf("// Set CSP headers"));
assert(ctx.includes("params.isEditable"), "the OS context menu must only handle editable fields");
assert(ctx.includes("if (!menu.items.length) return;"), "with nothing to offer, the click must fall through to the in-app context menu");
assert(ctx.includes("!app.isPackaged"), "DevTools entries must not ship in the packaged right-click menu");

console.log("main.trayUpdater.selftest.mjs: ok");
