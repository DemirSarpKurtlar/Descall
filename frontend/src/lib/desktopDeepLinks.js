import { resolveDeepLink } from "./deepLinks.js";

/**
 * descall:// links opened from Windows in the Tauri desktop app. The installer registers
 * the scheme; the shell picks the link out of the launch arguments (cold start, or a second
 * launch while Descall runs) and keeps it until the page takes it
 * (electronAPI.takeDeepLink, desktop/app/shim/electron-api-shim.js). app:deep-link
 * (electronAPI.onDeepLink) announces a new one. Same rules as iOS / Android
 * (nativeDeepLinks.js): take, resolve with resolveDeepLink, hand the path to the router.
 * Taking clears it in the shell, so the event and the startup read never route it twice.
 * Electron has no such bridge: the caller gets a no-op.
 */
export function desktopDeepLinkBridge(api) {
  return api && typeof api.takeDeepLink === "function" && typeof api.onDeepLink === "function" ? api : null;
}

export function startDesktopDeepLinks(api, onPath) {
  const bridge = desktopDeepLinkBridge(api);
  if (!bridge || typeof onPath !== "function") return () => {};
  let stopped = false;
  const drain = async () => {
    if (stopped) return;
    try {
      const url = await bridge.takeDeepLink();
      // Once taken in the shell the link is gone, so route it even if this listener was
      // just torn down (StrictMode remount).
      if (!url) return;
      const link = resolveDeepLink(url);
      if (link?.path) onPath(link.path);
    } catch {
      /* shell without the command */
    }
  };
  let off = null;
  try {
    off = bridge.onDeepLink(() => {
      drain();
    });
  } catch {
    off = null;
  }
  drain();
  return () => {
    stopped = true;
    try {
      if (typeof off === "function") off();
    } catch {
      /* ignore */
    }
  };
}
