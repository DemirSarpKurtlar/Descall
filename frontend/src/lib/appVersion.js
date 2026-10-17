/**
 * The version actually running on this device (2.10.109), for the admin panel.
 *   Electron  → app.getVersion() over IPC (window.electronAPI.getVersion)
 *   iOS       → CFBundleShortVersionString + CFBundleVersion (DescallDisplay.getAppInfo)
 *   web / Android / fallback → the version this JS bundle was built from
 *                              (__DESCALL_VERSION__, injected by vite.config.js)
 */

export const BUILD_VERSION = typeof __DESCALL_VERSION__ !== "undefined" ? String(__DESCALL_VERSION__) : "";

export function cleanVersion(value) {
  const v = String(value ?? "").trim().replace(/^v/i, "");
  return /^\d+(\.\d+){0,3}([-+][\w.]+)?$/.test(v) ? v : "";
}

/** "Windows" | "macOS" | "Linux" from a user agent / platform string. */
export function desktopOsName(ua = "") {
  const s = String(ua);
  if (/Windows/i.test(s)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(s)) return "macOS";
  if (/Linux|X11/i.test(s)) return "Linux";
  return "";
}

/** Platform label for the version line. */
export function platformLabel({ isElectron = false, nativePlatform = "web", userAgent = "" } = {}) {
  if (nativePlatform === "ios") return "iOS";
  if (nativePlatform === "android") return "Android";
  if (isElectron) return desktopOsName(userAgent) || "Masaüstü";
  return "Web";
}

/**
 * Text for the admin panel, e.g. "Sürüm 2.10.109 · Windows" or
 * "Sürüm 2.10.109 (20261017.1942) · iOS". `format` is the localized
 * "Sürüm {version}" template.
 */
export function formatVersionLine({ version, build = "", platform = "", format = (v) => `Sürüm ${v}` } = {}) {
  const v = cleanVersion(version);
  if (!v) return "";
  const b = String(build || "").trim();
  const withBuild = b && b !== v ? `${v} (${b})` : v;
  return platform ? `${format(withBuild)} · ${platform}` : format(withBuild);
}

/** Resolve { version, build, platform } from the runtime. Never throws. */
export async function resolveRuntimeVersion({ win = typeof window !== "undefined" ? window : undefined, capacitor = null } = {}) {
  const ua = win?.navigator?.userAgent || "";
  const isElectron = Boolean(win?.electronAPI) || /Electron\//.test(ua);
  let nativePlatform = "web";
  try {
    const cap = capacitor || win?.Capacitor;
    if (cap?.isNativePlatform?.()) nativePlatform = cap.getPlatform?.() || "web";
  } catch {
    /* ignore */
  }
  const platform = platformLabel({ isElectron, nativePlatform, userAgent: ua });
  let version = "";
  let build = "";
  try {
    if (isElectron && typeof win?.electronAPI?.getVersion === "function") {
      version = cleanVersion(await win.electronAPI.getVersion());
    } else if (nativePlatform === "ios") {
      const plugin = win?.Capacitor?.Plugins?.DescallDisplay;
      if (plugin?.getAppInfo) {
        const info = await plugin.getAppInfo();
        version = cleanVersion(info?.version);
        build = String(info?.build || "");
      }
    }
  } catch {
    /* fall back to the bundle version */
  }
  return { version: version || cleanVersion(BUILD_VERSION), build, platform };
}
