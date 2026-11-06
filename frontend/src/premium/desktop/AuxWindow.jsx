/**
 * A Descall+ portal window: window.open("about:blank", "descall-premium-<kind>") from the
 * main renderer, then React renders into it with createPortal. Same origin and same
 * process, so the child shares this renderer's state, sockets and MediaStreams; no second
 * app, no second login, almost no extra RAM. Electron main decides whether the window may
 * open (setWindowOpenHandler -> premium module, gated) and sets its size, position,
 * always-on-top and opacity. If main refuses, window.open returns null and onClosed runs.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import auxCss from "./auxWindows.css?inline";

export const AUX_FRAME_PREFIX = "descall-premium-";

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
      style.textContent = auxCss;
      doc.head.appendChild(style);
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
    // Main can close the window (tray, layout, gate lost); pagehide covers it, the poll is a backstop.
    const poll = window.setInterval(() => { if (w.closed) finish(); }, 1500);
    return () => {
      window.clearInterval(poll);
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
