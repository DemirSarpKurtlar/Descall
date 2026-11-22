/**
 * Settings > Desktop app: the update status the desktop shell reports (Electron preload or the
 * Tauri shim, same electronAPI). Pure, tested by desktopUpdateState.selftest.mjs.
 *
 * Status: "idle" (not checked yet), "checking", "upToDate", "downloading" (with percent),
 * "ready" (staged, restart installs), "error", "unavailable" (dev / unsigned build: the shell
 * answers { skipped: true }).
 */

export function hasDesktopUpdater(api) {
  return Boolean(api && api.isElectron && typeof api.checkForUpdates === "function" && typeof api.getUpdateStatus === "function");
}

const cleanVersion = (v) => {
  const s = String(v ?? "").trim().replace(/^v/i, "");
  return /^\d+\.\d+\.\d+/.test(s) ? s.slice(0, 32) : null;
};

/** check-for-updates answer -> { status, version }. */
export function statusFromCheck(res) {
  if (!res || res.success === false) return { status: "error", version: null };
  if (res.skipped) return { status: "unavailable", version: null };
  if (res.updateReady) return { status: "ready", version: cleanVersion(res.updateVersion) };
  const next = cleanVersion(res.updateInfo?.version);
  // Electron answers `available`; an older shell only updateInfo (null when up to date).
  const available = typeof res.available === "boolean" ? res.available : Boolean(next);
  if (available) return { status: "downloading", version: next };
  return { status: "upToDate", version: null };
}

/** The user pressed Check: a download or a staged update already on screen stays. */
export function startCheck(prev) {
  return prev.status === "downloading" || prev.status === "ready" ? prev : { ...prev, status: "checking" };
}

/**
 * The check answer arrived. While a download runs, both shells answer "nothing new"
 * (the check is skipped as in flight): the download on screen wins over that.
 */
export function mergeCheck(prev, next) {
  if (prev.status === "downloading" && (next.status === "upToDate" || next.status === "downloading")) return prev;
  if (prev.status === "ready" && next.status !== "ready") return prev;
  return { ...prev, ...next };
}

/** get-update-status at mount: a staged update shows as ready, anything else stays idle. */
export function statusFromStatus(res, prev = { status: "idle", version: null }) {
  if (res && res.updateReady) return { status: "ready", version: cleanVersion(res.updateVersion) };
  return prev;
}

/** Shell events (update:downloading / progress / ready / error) while the page is open. */
export function statusFromEvent(prev, type, payload = {}) {
  const p = payload || {};
  switch (type) {
    case "downloading":
      return { status: "downloading", version: cleanVersion(p.version) || prev.version, percent: 0 };
    case "progress": {
      const n = Number(p.percent);
      return { status: "downloading", version: cleanVersion(p.version) || prev.version, percent: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : prev.percent ?? null };
    }
    case "ready":
      return { status: "ready", version: cleanVersion(p.version) || prev.version };
    case "error":
      // A quiet background check failure ('check') does not replace what the user sees,
      // unless they are waiting on a check or a download right now.
      if (p.phase === "download" || prev.status === "downloading" || prev.status === "checking") return { status: "error", version: prev.version };
      return prev;
    default:
      return prev;
  }
}

/**
 * Update card (ElectronUpdateToast) after update:error. 'download' (or a failure while the
 * download card shows) and 'install' (Tauri: the staged installer did not start; the app is
 * still running and the update stays staged) show the error card with Retry; a quiet
 * background 'check' failure never replaces what is on screen. The install case used to drop
 * the card (prev "installing" -> null), so the "Install now" chip vanished without a word.
 */
export function toastStateAfterError(prev, phase) {
  if (phase === "download" || phase === "install" || prev === "downloading") return "error";
  return prev === "ready" ? prev : null;
}

const RELEASES = "https://github.com/DemirSarpKurtlar/Descall/releases";

/**
 * "Download page" on the error card. Electron: releases/latest (the Electron release). The
 * Tauri app's releases are prereleases (desktop-vX.Y.Z, never "latest"), so releases/latest
 * offered the Electron installer to a Tauri user; it goes to the desktop release instead.
 */
export function updateDownloadPage({ tauri = false, version = null } = {}) {
  if (!tauri) return `${RELEASES}/latest`;
  const v = cleanVersion(version);
  return v ? `${RELEASES}/tag/desktop-v${v}` : `${RELEASES}?q=desktop-v&expanded=true`;
}
