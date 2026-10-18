/**
 * Boot splash removal that does not depend on the inline scripts in index.html (2.11.11).
 *
 * index.html owns the splash (dismiss timing, paint watchdog, "Tekrar dene"), but those are
 * inline scripts and only run when the CSP hashes match. When they did not (Windows CRLF
 * build, 2.11.2–2.11.10) `window.__descallDismissBootSplash` never existed, React rendered
 * the app underneath and the splash stayed on top forever. React's own mount now removes
 * the splash and tells the Electron main process, whatever happened to the inline scripts.
 */

const HIDE_CLASS = "boot-splash--hide";

function splashNodes(doc) {
  try {
    return Array.from(doc.querySelectorAll("#boot-splash"));
  } catch {
    return [];
  }
}

/** Electron main gets the milestone straight over the preload bridge. */
export function reportBootPhase(phase, win = typeof window !== "undefined" ? window : null) {
  if (!win) return;
  try {
    if (typeof win.__descallReportBoot === "function") {
      win.__descallReportBoot(phase);
      return;
    }
    const api = win.electronAPI;
    if (api && typeof api.bootState === "function") {
      const ms = win.performance && typeof win.performance.now === "function" ? Math.round(win.performance.now()) : 0;
      api.bootState(phase, ms);
    }
  } catch {
    /* ignore */
  }
}

/** True when #root shows real UI (same rule as index.html appHasPainted). */
export function rootHasPainted(doc = typeof document !== "undefined" ? document : null) {
  if (!doc) return false;
  const app = doc.getElementById("root");
  if (!app || !app.firstElementChild) return false;
  const box = typeof app.getBoundingClientRect === "function" ? app.getBoundingClientRect() : { height: 0 };
  const text = String(app.innerText || app.textContent || "").replace(/\s+/g, " ").trim();
  return box.height >= 80 && text.length > 0;
}

/** Fade out and remove every #boot-splash node now, then report "painted". */
export function removeBootSplashNow({ win = typeof window !== "undefined" ? window : null, doc = typeof document !== "undefined" ? document : null, fadeMs = 320 } = {}) {
  if (!win || !doc) return false;
  const nodes = splashNodes(doc);
  if (!nodes.length) return false;
  for (const n of nodes) {
    try { n.classList.add(HIDE_CLASS); } catch { /* ignore */ }
  }
  const finish = () => {
    for (const n of splashNodes(doc)) {
      try { n.parentNode && n.parentNode.removeChild(n); } catch { /* ignore */ }
    }
    reportBootPhase("painted", win);
  };
  if (fadeMs > 0 && typeof win.setTimeout === "function") win.setTimeout(finish, fadeMs);
  else finish();
  return true;
}

/**
 * Dismiss the splash from React. Uses index.html's dismiss when it exists (timing, holds),
 * and removes the splash directly when it does not, or when it is still there after
 * `maxMs + graceMs` while the app has painted (a dismiss that silently did nothing).
 * Returns a cleanup function.
 */
export function dismissBootSplashFromApp({
  minMs = 450,
  maxMs = 1800,
  graceMs = 1200,
  win = typeof window !== "undefined" ? window : null,
  doc = typeof document !== "undefined" ? document : null,
} = {}) {
  if (!win || !doc) return () => {};
  const held = () => Number(win.__descallBootHolds || 0) > 0;
  const dismiss = win.__descallDismissBootSplash;
  if (typeof dismiss !== "function") {
    // Inline boot scripts never ran (CSP): nothing else will ever remove the splash.
    reportBootPhase("inline-missing", win);
    if (!held()) removeBootSplashNow({ win, doc, fadeMs: 0 });
    return () => {};
  }
  try {
    dismiss({ minMs, maxMs });
  } catch {
    /* ignore */
  }
  let timer = null;
  let tries = 0;
  const check = () => {
    timer = null;
    if (!splashNodes(doc).length) return;
    if (held()) {
      timer = win.setTimeout(check, 1000);
      return;
    }
    const failed = splashNodes(doc).some((n) => n.getAttribute && n.getAttribute("data-boot-failed") === "1");
    if (rootHasPainted(doc)) {
      reportBootPhase("forced-dismiss", win);
      removeBootSplashNow({ win, doc });
      return;
    }
    // Not painted yet: index.html's own watchdog handles the failure screen; keep looking
    // a little so a late paint still clears a stuck overlay.
    if (!failed && tries++ < 30) timer = win.setTimeout(check, 1000);
  };
  timer = win.setTimeout(check, maxMs + graceMs);
  return () => {
    if (timer) win.clearTimeout(timer);
  };
}
