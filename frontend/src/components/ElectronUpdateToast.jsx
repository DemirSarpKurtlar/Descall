import { useEffect, useState } from "react";
import { useT } from "../context/LocaleContext";

/**
 * Premium charcoal desktop update toast — no emoji spam, clear status/progress,
 * does not steal focus (render-only; Electron showsInactive for OS notifs).
 */
export default function ElectronUpdateToast() {
  const t = useT();
  const [state, setState] = useState(null); // null | downloading | installing | ready
  const [version, setVersion] = useState(null);
  const [percent, setPercent] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI?.onUpdateDownloading) {
      return undefined;
    }
    const api = window.electronAPI;
    const unsubs = [];

    if (api.onUpdateDownloading) {
      unsubs.push(
        api.onUpdateDownloading(({ version: v } = {}) => {
          setVersion(v || null);
          setState("downloading");
          setPercent(0);
        }),
      );
    }
    if (api.onUpdateProgress) {
      unsubs.push(
        api.onUpdateProgress(({ percent: p, version: v } = {}) => {
          if (v) setVersion(v);
          setState("downloading");
          const n = Number(p);
          setPercent(Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null);
        }),
      );
    }
    if (api.onUpdateReady) {
      unsubs.push(
        api.onUpdateReady(({ version: v } = {}) => {
          setVersion(v || null);
          setState("ready");
          setPercent(100);
        }),
      );
    }
    if (api.onUpdateInstalling) {
      unsubs.push(
        api.onUpdateInstalling(({ version: v } = {}) => {
          setVersion(v || null);
          setState("installing");
          setPercent(100);
        }),
      );
    }
    if (api.onUpdateError) {
      unsubs.push(
        api.onUpdateError(() => {
          setState(null);
          setPercent(null);
        }),
      );
    }

    return () => {
      unsubs.forEach((off) => {
        try {
          off?.();
        } catch {
          /* ignore */
        }
      });
    };
  }, []);

  if (!state) return null;

  const label =
    state === "installing"
      ? t("updateToast.installing", { version: version || "" })
      : state === "ready"
        ? t("updateToast.ready", { version: version || "" })
        : t("updateToast.downloading", { version: version || "" });

  const showBar = state === "downloading" || state === "installing" || state === "ready";
  const barWidth =
    state === "installing" || state === "ready"
      ? 100
      : percent != null
        ? percent
        : 8;

  return (
    <div
      className={`electron-update-toast is-${state}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="electron-update-toast-inner">
        <div className="electron-update-toast-kicker">{t("updateToast.kicker")}</div>
        <div className="electron-update-toast-label">{label}</div>
        {showBar ? (
          <div
            className="electron-update-toast-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(barWidth)}
          >
            <div
              className="electron-update-toast-bar-fill"
              style={{ width: `${barWidth}%` }}
            />
          </div>
        ) : null}
        {state === "downloading" && percent != null ? (
          <div className="electron-update-toast-meta">
            {t("updateToast.percent", { percent: Math.round(percent) })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
