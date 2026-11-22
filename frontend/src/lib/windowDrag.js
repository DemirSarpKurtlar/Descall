/**
 * Title bars of the desktop windows (main TitleBar, admin panel, signup stats, app lock).
 *
 * Electron drags them through CSS -webkit-app-region and lets the OS maximize on a
 * double-click. The Tauri shell (WebView2) turns app-region into a native caption that ate
 * the clicks on the window buttons, so there the bars carry data-tauri-drag-region="deep"
 * (titlebar.css switches app-region off under it) and Tauri's own drag script drags and
 * toggles maximize on the second mousedown.
 */

import { isTauriShell } from "./desktopShell.js";

/** True in the Tauri desktop shell (its globals, the shim's bridge, or html.tauri-app). */
export function inTauriShell() {
  if (typeof window === "undefined") return false;
  try {
    if (isTauriShell()) return true;
    return Boolean(document?.documentElement?.classList?.contains("tauri-app"));
  } catch {
    return false;
  }
}

/**
 * onDoubleClick for a title bar that maximizes. Skipped in Tauri, where the drag script has
 * already toggled maximize on that double-click: a second toggle would undo it.
 */
export function titleBarDoubleClick(toggle) {
  return (event) => {
    if (inTauriShell()) return;
    if (typeof toggle === "function") toggle(event);
  };
}
