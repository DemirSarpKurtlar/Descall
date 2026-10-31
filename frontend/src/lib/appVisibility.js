/**
 * 3.7.15 idle CPU (Electron). main.cjs keeps the renderer fully awake in the
 * background (backgroundThrottling: false, so sockets and message sounds keep
 * working in the tray), which also means Chromium never reports the page as
 * hidden and every CSS animation kept repainting the frosted panels while the
 * window was minimized or hidden. Main now sends `app:visibility`; this sets
 * `html.app-backgrounded`, and styles/app-backgrounded.css pauses animations.
 * Sockets, timers, notifications and sounds are untouched.
 */
import "../styles/app-backgrounded.css";

export const BACKGROUNDED_CLASS = "app-backgrounded";

export function applyAppVisibility(root, { backgrounded } = {}) {
  if (!root?.classList) return false;
  root.classList.toggle(BACKGROUNDED_CLASS, Boolean(backgrounded));
  return root.classList.contains(BACKGROUNDED_CLASS);
}

export function installAppVisibility(win = typeof window !== "undefined" ? window : undefined) {
  const api = win?.electronAPI;
  if (!api || typeof api.onAppVisibility !== "function") return () => {};
  const root = win.document?.documentElement;
  const off = api.onAppVisibility((payload) => applyAppVisibility(root, payload));
  return typeof off === "function" ? off : () => {};
}
