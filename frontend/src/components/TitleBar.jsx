import { useState, useEffect } from "react";
import { hasDesktopBridge } from "../lib/desktopShell.js";
import { createPortal } from "react-dom";
import { Minus, Square, X } from "./ui/Icon.jsx";
import { useT } from "../context/LocaleContext";
import DescallBrand from "./brand/DescallBrand";
import { ELECTRON_TITLEBAR_H, electronContentBox } from "../lib/electronViewport";

/**
 * The bar lives in its own host, the first child of <body>, not inside #root. The scene
 * themes (emberfall, borealis, starwell, chromeveil, iriscape) give #root z-index 1, which
 * capped the bar's z-index inside #root: every modal portaled to <body> then covered the
 * bar and its window buttons. As a direct body layer its z-index (--z-titlebar) is global.
 */
const HOST_ID = "descall-titlebar-host";
function titleBarHost() {
  if (typeof document === "undefined" || !document.body) return null;
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    document.body.insertBefore(host, document.body.firstChild);
  }
  return host;
}

/**
 * Frameless Electron title bar, always mounted while the desktop app runs.
 * Adds `body.electron-app` so layout offsets below this bar (no overlap).
 */
export default function TitleBar() {
  const t = useT();
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = hasDesktopBridge();

  useEffect(() => {
    if (!isElectron) return undefined;

    document.body.classList.add("electron-app");
    document.documentElement.classList.add("electron-app");

    const applyInset = (bottomInset) => {
      const inset = Math.max(0, Math.round(Number(bottomInset) || 0));
      const innerH = Number(window.innerHeight) || 0;
      const contentH = Math.max(0, innerH - ELECTRON_TITLEBAR_H - inset);
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty("--electron-content-h", `${contentH}px`);
      rootStyle.setProperty("--electron-bottom-inset", `${inset}px`);
    };

    const syncViewport = () => {
      const screen = window.screen;
      const fallback = electronContentBox({
        innerHeight: window.innerHeight,
        availHeight: screen?.availHeight,
        availTop: screen?.availTop,
      });
      applyInset(fallback.bottomInset);
      window.electronAPI?.getContentBox?.()
        .then((box) => {
          if (box && Number.isFinite(Number(box.bottomInset))) applyInset(box.bottomInset);
        })
        .catch(() => {});
    };

    let offMaximized = null;
    if (window.electronAPI?.onMaximizedChange) {
      offMaximized = window.electronAPI.onMaximizedChange((maximized) => {
        setIsMaximized(Boolean(maximized));
        // Maximize can land under the taskbar before a resize event.
        requestAnimationFrame(syncViewport);
      });
    }

    syncViewport();
    const offContentBox = window.electronAPI?.onContentBox?.((box) => {
      if (box && Number.isFinite(Number(box.bottomInset))) applyInset(box.bottomInset);
    });
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    const onFs = () => {
      if (document.fullscreenElement) {
        try { document.exitFullscreen(); } catch (_) { /* ignore */ }
        window.electronAPI?.maximizeWindow?.();
      }
    };
    document.addEventListener("fullscreenchange", onFs);

    return () => {
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      document.removeEventListener("fullscreenchange", onFs);
      offContentBox?.();
      if (typeof offMaximized === "function") offMaximized();
    };
  }, [isElectron]);

  if (!isElectron) return null;
  const host = titleBarHost();

  const bar = (
    // data-tauri-drag-region="deep": the Tauri shell drags (and double-click maximizes) from
    // anywhere on the bar except its buttons; Electron uses -webkit-app-region instead.
    <div className="titlebar" role="banner" data-tauri-drag-region="deep">
      <div className="titlebar-brand">
        <DescallBrand />
      </div>

      <div className="titlebar-controls">
        <button
          type="button"
          className="win-btn minimize"
          onClick={() => window.electronAPI?.minimizeWindow?.()}
          title={t("Minimize")}
          aria-label={t("Minimize")}
        >
          <Minus size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="win-btn maximize"
          onClick={() => window.electronAPI?.maximizeWindow?.()}
          title={isMaximized ? t("Restore") : t("Maximize")}
          aria-label={isMaximized ? t("Restore") : t("Maximize")}
        >
          {isMaximized ? (
            // Restore: two stacked windows, like the Windows caption button.
            <svg className="win-restore-glyph" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
              <rect x="1.75" y="4.25" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M4.25 4.25V3.25c0-.83.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5h-1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <Square size={14} strokeWidth={2} />
          )}
        </button>
        <button
          type="button"
          className="win-btn close"
          onClick={() => window.electronAPI?.closeWindow?.()}
          title={t("Close")}
          aria-label={t("Close")}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
  return host ? createPortal(bar, host) : bar;
}
