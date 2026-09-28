import { useState, useEffect } from "react";
import { Minus, Square, X } from "lucide-react";
import { useT } from "../context/LocaleContext";
import DescallBrand from "./brand/DescallBrand";
import { electronContentBox } from "../lib/electronViewport";

/**
 * Frameless Electron title bar — always mounted while the desktop app runs.
 * Adds `body.electron-app` so layout offsets below this bar (no overlap).
 */
export default function TitleBar() {
  const t = useT();
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron =
    typeof window !== "undefined" && !!window.electronAPI?.isElectron;

  useEffect(() => {
    if (!isElectron) return undefined;

    document.body.classList.add("electron-app");
    document.documentElement.classList.add("electron-app");

    const syncViewport = () => {
      const screen = window.screen;
      const { contentH, bottomInset } = electronContentBox({
        innerHeight: window.innerHeight,
        availHeight: screen?.availHeight,
        availTop: screen?.availTop,
      });
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty("--electron-content-h", `${contentH}px`);
      rootStyle.setProperty("--electron-bottom-inset", `${bottomInset}px`);
    };

    if (window.electronAPI?.onMaximizedChange) {
      window.electronAPI.onMaximizedChange((maximized) => {
        setIsMaximized(Boolean(maximized));
        // Maximize can land under the taskbar before a resize event.
        requestAnimationFrame(syncViewport);
      });
    }

    syncViewport();
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
    };
  }, [isElectron]);

  if (!isElectron) return null;

  return (
    <div className="titlebar" role="banner">
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
            <Square size={12} strokeWidth={2} />
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
}
