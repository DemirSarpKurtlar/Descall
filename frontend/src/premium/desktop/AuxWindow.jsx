/**
 * A Descall+ portal window: window.open("about:blank", "descall-premium-<kind>") from the
 * main renderer, then React renders into it with createPortal. Same origin and same
 * process, so the child shares this renderer's state, sockets and MediaStreams; no second
 * app, no second login, almost no extra RAM. Electron main decides whether the window may
 * open (setWindowOpenHandler -> premium module, gated) and sets its size, position,
 * always-on-top and opacity. If main refuses, window.open returns null and onClosed runs.
 *
 * Tauri shell (html.tauri-app): the portal is a WebView2 window the shell created for this
 * window.open (on_new_window, opener kept). WebView2 turns a CSS drag region into a native
 * caption, which swallowed the clicks on the bar's pin / open / close buttons, so there the
 * bar has no CSS drag region and a press on it asks the shell to drag that window
 * (plugin:window|start_dragging with the portal's label), as the main title bar does.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import auxCss from "./auxWindows.css?inline";

export const AUX_FRAME_PREFIX = "descall-premium-";

/** Window labels the Tauri shell gives the portal windows (src-tauri/src/premium/wins.rs). */
export const TAURI_PORTAL_LABEL = Object.freeze({ call: "pip", sidebar: "sidebar" });

export function isTauriShell(doc = typeof document !== "undefined" ? document : null) {
  try {
    return Boolean(doc && doc.documentElement && doc.documentElement.classList.contains("tauri-app"));
  } catch {
    return false;
  }
}

/** The app's @font-face rules (Inter) with absolute URLs, so the portal draws the same font. */
export function fontFaceCss(doc = document, max = 24) {
  const out = [];
  try {
    for (const sheet of Array.from(doc.styleSheets || [])) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      const base = sheet.href || doc.baseURI;
      for (const r of Array.from(rules || [])) {
        if (out.length >= max) return out.join("\n");
        if (r.type !== 5 && !/^@font-face/i.test(r.cssText || "")) continue;
        out.push(String(r.cssText).replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => {
          if (/^(data:|blob:)/i.test(u)) return m;
          try { return `url("${new URL(u, base).href}")`; } catch { return m; }
        }));
      }
    }
  } catch { /* no fonts: system font */ }
  return out.join("\n");
}

/** Tauri: press on the bar (not its buttons) -> the shell drags the portal window. */
export function attachTauriDrag(doc, kind, invoke) {
  const label = TAURI_PORTAL_LABEL[kind];
  if (!doc || !label || typeof invoke !== "function") return () => {};
  const onDown = (e) => {
    if (e.button !== 0 || !e.target || typeof e.target.closest !== "function") return;
    if (!e.target.closest(".ax-bar") || e.target.closest("button, a, input, select, textarea, .ax-nodrag")) return;
    e.preventDefault();
    Promise.resolve().then(() => invoke("plugin:window|start_dragging", { label })).catch(() => {});
  };
  doc.addEventListener("mousedown", onDown);
  return () => doc.removeEventListener("mousedown", onDown);
}

function tauriInvoke() {
  const I = typeof window !== "undefined" ? window.__TAURI_INTERNALS__ : null;
  return I && typeof I.invoke === "function" ? (cmd, args) => I.invoke(cmd, args) : null;
}

function brandRgb() {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue("--g-brand-rgb").trim();
  } catch {
    return "";
  }
}

export default function AuxWindow({ kind, title, onClosed, children }) {
  const [container, setContainer] = useState(null);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  const winRef = useRef(null);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setContainer(null);
      closedRef.current?.();
    };
    let w = null;
    try {
      w = window.open("about:blank", `${AUX_FRAME_PREFIX}${kind}`);
    } catch {
      w = null;
    }
    if (!w) {
      finish();
      return undefined;
    }
    winRef.current = w;
    const doc = w.document;
    try {
      doc.documentElement.lang = document.documentElement.lang || "en";
      doc.title = title || "Descall";
      const style = doc.createElement("style");
      const fonts = fontFaceCss(document);
      style.textContent = fonts ? `${fonts}\n${auxCss}` : auxCss;
      doc.head.appendChild(style);
      if (isTauriShell(document)) doc.documentElement.classList.add("tauri-app");
      const rgb = brandRgb();
      if (rgb) doc.documentElement.style.setProperty("--g-brand-rgb", rgb);
      doc.body.innerHTML = "";
      const root = doc.createElement("div");
      root.id = "aux-root";
      root.dataset.kind = kind;
      doc.body.appendChild(root);
      setContainer(root);
    } catch {
      finish();
      return undefined;
    }
    const onHide = () => finish();
    w.addEventListener("pagehide", onHide);
    const invoke = isTauriShell(document) ? tauriInvoke() : null;
    const detachDrag = invoke ? attachTauriDrag(doc, kind, invoke) : () => {};
    // Main can close the window (tray, layout, gate lost); pagehide covers it, the poll is a backstop.
    const poll = window.setInterval(() => { if (w.closed) finish(); }, 1500);
    return () => {
      window.clearInterval(poll);
      try { detachDrag(); } catch { /* gone */ }
      try { w.removeEventListener("pagehide", onHide); } catch { /* gone */ }
      done = true;
      try { if (!w.closed) w.close(); } catch { /* gone */ }
    };
  }, [kind]);

  useEffect(() => {
    try { if (winRef.current && !winRef.current.closed) winRef.current.document.title = title || "Descall"; } catch { /* gone */ }
  }, [title]);

  return container ? createPortal(children, container) : null;
}
