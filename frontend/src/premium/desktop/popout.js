/**
 * Descall+ pop-out windows (multi_window): Electron main opens the same app document on a
 * route (descall://app/direct/<name>?popout=1). Such a window shows only the conversation:
 * html.descall-popout hides the side lists (styles in premium.css), and the Descall+ host,
 * overlay card and notifications stay with the main window.
 * The flag lives in sessionStorage because the router may drop the query string.
 */
const KEY = "descall:popout";

export function isPopoutWindow() {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search || "").get("popout") === "1") {
      window.sessionStorage.setItem(KEY, "1");
      return true;
    }
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Called once at boot (main.jsx). */
export function applyPopoutMode() {
  if (!isPopoutWindow()) return false;
  try {
    document.documentElement.classList.add("descall-popout");
  } catch {
    /* ignore */
  }
  return true;
}

/** Route of the current view that can be popped out, or null. */
export function popoutRouteFor(pathname) {
  const p = String(pathname || "");
  if (/^\/direct\/[^/?#]+$/.test(p)) return p;
  if (/^\/groups\/[^/?#]+$/.test(p)) return p;
  if (/^\/servers\/[^/?#]+\/[^/?#]+$/.test(p)) return p;
  return null;
}
