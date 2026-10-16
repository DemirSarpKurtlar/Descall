/**
 * Cold-start visibility for the desktop app.
 *
 * A manual launch (Start menu, desktop shortcut, taskbar) always shows and
 * focuses the window after the splash. The persisted "start in background"
 * file is not enough: it used to survive a full quit and the next shortcut
 * launch came up in the tray.
 *
 * Hidden boot is only for Windows login auto-start. The login item is
 * registered with --autostart and --hidden. wasOpenedAtLogin /
 * wasOpenedAsHidden cover macOS and any Windows build that reports them.
 *
 * A quiet updater relaunch is a separate one-shot (the process that just
 * installed writes a marker). It is not a manual launch, so it may come back
 * hidden or minimized. The marker is consumed on read.
 */

const AUTOSTART_ARGS = ["--autostart", "--hidden"];
const UPDATER_RELAUNCH_MAX_AGE_MS = 15 * 60 * 1000;

function hasArg(argv, flag) {
  for (const raw of argv || []) {
    if (typeof raw !== "string" || !raw) continue;
    if (raw === flag) return true;
    const parts = raw.split(/\s+/);
    if (parts.length > 1 && parts.includes(flag)) return true;
  }
  return false;
}

function isAutostartLaunch({ argv, wasOpenedAtLogin, wasOpenedAsHidden } = {}) {
  if (wasOpenedAtLogin || wasOpenedAsHidden) return true;
  return AUTOSTART_ARGS.some((flag) => hasArg(argv, flag));
}

/**
 * @param {number|null|undefined} mtimeMs
 * @param {number} nowMs
 * @param {number} [maxAgeMs]
 */
function isFreshRelaunchMarker(mtimeMs, nowMs, maxAgeMs = UPDATER_RELAUNCH_MAX_AGE_MS) {
  const mtime = Number(mtimeMs);
  const now = Number(nowMs);
  if (!Number.isFinite(mtime) || !Number.isFinite(now)) return false;
  const age = now - mtime;
  return age >= -5000 && age <= maxAgeMs;
}

/**
 * @returns {{ action: 'show'|'hide'|'minimize', showSplash: boolean, reason: 'manual'|'autostart'|'updater-relaunch' }}
 */
function decideColdStart({
  argv,
  wasOpenedAtLogin = false,
  wasOpenedAsHidden = false,
  backgroundMode = null,
  updaterRelaunch = false,
} = {}) {
  if (isAutostartLaunch({ argv, wasOpenedAtLogin, wasOpenedAsHidden })) {
    return { action: "hide", showSplash: false, reason: "autostart" };
  }
  // --updated alone is not enough: a manual launch that installs from the
  // splash is relaunched with that flag, and a stale tray file must not hide it.
  if (updaterRelaunch && (backgroundMode === "hidden" || backgroundMode === "minimized")) {
    return {
      action: backgroundMode === "minimized" ? "minimize" : "hide",
      showSplash: false,
      reason: "updater-relaunch",
    };
  }
  return { action: "show", showSplash: true, reason: "manual" };
}

/** Registry / login-item payload. Enabled entries always carry the hidden args. */
function loginItemSettings(openAtLogin) {
  const enabled = Boolean(openAtLogin);
  return {
    openAtLogin: enabled,
    args: enabled ? AUTOSTART_ARGS.slice() : [],
  };
}

/** A second process (shortcut while the tray instance is alive) must raise the window. */
function secondInstanceAction() {
  return "show";
}

module.exports = {
  AUTOSTART_ARGS,
  UPDATER_RELAUNCH_MAX_AGE_MS,
  hasArg,
  isAutostartLaunch,
  isFreshRelaunchMarker,
  decideColdStart,
  loginItemSettings,
  secondInstanceAction,
};
