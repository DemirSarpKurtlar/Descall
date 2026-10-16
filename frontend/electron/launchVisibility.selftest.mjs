/**
 * Manual desktop launches show the window. Only Windows login auto-start
 * (and a one-shot quiet updater relaunch) stay hidden.
 *
 * Run: node frontend/electron/launchVisibility.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  AUTOSTART_ARGS,
  UPDATER_RELAUNCH_MAX_AGE_MS,
  decideColdStart,
  isFreshRelaunchMarker,
  loginItemSettings,
  secondInstanceAction,
} = require("./launchVisibility.cjs");

const root = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(root, "main.cjs"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const exe = "C:\\Program Files\\Descall\\Descall.exe";

// Manual launch ignores a stale tray / minimized flag.
assert(
  decideColdStart({ argv: [exe], backgroundMode: "hidden" }).action === "show",
  "a shortcut launch must show even when the tray flag is still set"
);
assert(
  decideColdStart({ argv: [exe], backgroundMode: "minimized" }).reason === "manual",
  "a shortcut launch must not restore a minimized flag"
);
assert(
  decideColdStart({ argv: [exe, "--updated"], backgroundMode: "hidden" }).action === "show",
  "an installer relaunch without the one-shot marker must show, even if the tray flag is stale"
);

// Login auto-start is the only user-facing hidden boot.
for (const flag of AUTOSTART_ARGS) {
  const decision = decideColdStart({ argv: [exe, flag], backgroundMode: null });
  assert(decision.action === "hide" && decision.showSplash === false, `${flag} must boot hidden with no splash`);
  assert(decision.reason === "autostart", `${flag} is an autostart launch`);
}
assert(
  decideColdStart({
    argv: [exe],
    wasOpenedAtLogin: true,
  }).action === "hide",
  "wasOpenedAtLogin must boot hidden"
);
assert(
  decideColdStart({
    argv: [exe],
    wasOpenedAsHidden: true,
  }).action === "hide",
  "wasOpenedAsHidden must boot hidden"
);
assert(
  decideColdStart({ argv: [exe, "--hidden-room"] }).action === "show",
  "a lookalike flag must not count as auto-start"
);
assert(
  decideColdStart({ argv: [`${exe} --autostart --hidden`] }).action === "hide",
  "a single argv slot that carries both flags must count as auto-start"
);

// Quiet updater relaunch may stay in the tray, and only for that process.
assert(
  decideColdStart({ argv: [exe, "--updated"], backgroundMode: "hidden", updaterRelaunch: true }).action === "hide",
  "a quiet update relaunch from the tray stays hidden"
);
assert(
  decideColdStart({ argv: [exe], backgroundMode: "hidden", updaterRelaunch: false }).action === "show",
  "a consumed or absent relaunch marker must not keep the next launch hidden"
);
assert(
  decideColdStart({ argv: [exe], backgroundMode: "minimized", updaterRelaunch: true }).action === "minimize",
  "a quiet update relaunch from a minimized window stays minimized"
);
assert(
  decideColdStart({ argv: [exe, "--updated"], backgroundMode: null, updaterRelaunch: true }).action === "show",
  "a quiet update with no background mode shows the window"
);

const now = 1_700_000_000_000;
assert(isFreshRelaunchMarker(now, now), "a marker written now is fresh");
assert(
  !isFreshRelaunchMarker(now - UPDATER_RELAUNCH_MAX_AGE_MS - 1, now),
  "a stale updater marker must not hide a later manual launch"
);
assert(!isFreshRelaunchMarker(null, now), "a missing marker is not a relaunch");

const enabled = loginItemSettings(true);
assert(enabled.openAtLogin === true, "enabling auto-start sets openAtLogin");
assert(
  enabled.args.includes("--hidden") && enabled.args.includes("--autostart"),
  "the login item must be registered with the hidden args"
);
const disabled = loginItemSettings(false);
assert(disabled.openAtLogin === false && disabled.args.length === 0, "disabling auto-start clears the args");
assert(secondInstanceAction() === "show", "a second launch must show the existing window");

// main.cjs wires the decision into boot, the login item, and second-instance.
assert(main.includes("require('./launchVisibility.cjs')"), "main must load the launch decision");
assert(main.includes("decideColdStart("), "boot must ask decideColdStart");
assert(main.includes("loginItemSettings("), "login item registration must go through loginItemSettings");
assert(main.includes("userRequestedShow"), "a second launch during splash must be remembered");
const second = main.slice(main.indexOf("app.on('second-instance'"), main.indexOf("app.on('second-instance'") + 500);
assert(second.includes("showMainWindow()"), "second-instance must show and focus the existing window");
assert(second.includes("userRequestedShow = true"), "second-instance must request a show if the window is not up yet");
const ready = main.slice(main.indexOf("mainWindow.once('ready-to-show'"), main.indexOf("mainWindow.on('closed'"));
assert(ready.includes("launch.action === 'show'"), "ready-to-show must show on a manual launch");
assert(ready.includes("showMainWindow()"), "a manual launch must focus through showMainWindow");
assert(main.includes("setUpdaterRelaunch(true)"), "a quiet install must mark the following process as a relaunch");

console.log("launchVisibility.selftest.mjs: ok");
