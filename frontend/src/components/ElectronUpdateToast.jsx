import { useEffect, useRef, useState } from "react";
import { useT } from "../context/LocaleContext";
import Modal from "./ui/Modal";
import { getVoiceBusy, subscribeVoiceBusy } from "../lib/voiceBusy";

/**
 * Premium charcoal desktop update toast — no emoji spam, clear status/progress,
 * does not steal focus (render-only; Electron showsInactive for OS notifs).
 */
export default function ElectronUpdateToast() {
  const t = useT();
  const [state, setState] = useState(null); // null | downloading | installing | ready
  const [version, setVersion] = useState(null);
  const [percent, setPercent] = useState(null);
  const [deferred, setDeferred] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(() => getVoiceBusy());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmingRef = useRef(false);

  useEffect(() => subscribeVoiceBusy(setVoiceBusy), []);

  useEffect(() => {
    // Drop the main-process "deferred" hint once we know the user is not in
    // a call. While they are, the live voice-busy flag owns the copy.
    if (!voiceBusy && deferred) setDeferred(false);
  }, [voiceBusy, deferred]);

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
        api.onUpdateReady(({ version: v, deferred: isDeferred } = {}) => {
          setVersion(v || null);
          setDeferred(Boolean(isDeferred));
          setState("ready");
          setPercent(100);
        }),
      );
    }
    if (api.onConfirmRestart) {
      unsubs.push(
        api.onConfirmRestart(({ version: v } = {}) => {
          if (v) setVersion(v);
          setConfirmOpen(true);
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

  if (!state && !confirmOpen) return null;

  const heldForCall = voiceBusy;
  const label =
    state === "installing"
      ? t("updateToast.installing", { version: version || "" })
      : state === "ready"
        ? t(heldForCall || deferred ? "updateToast.readyDeferred" : "updateToast.ready", { version: version || "" })
        : t("updateToast.downloading", { version: version || "" });

  const askRestart = async () => {
    const api = window.electronAPI;
    if (!api?.restartApp) return;
    // Local busy is enough to ask first. Calling restart-app here would
    // install if the main-process flag hasn't caught up to this render yet.
    if (heldForCall) {
      setConfirmOpen(true);
      return;
    }
    try {
      const result = await api.restartApp();
      if (result?.needsConfirm) setConfirmOpen(true);
      else if (result?.installing) setState("installing");
    } catch {
      /* main process owns the install */
    }
  };

  const confirmRestart = async () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setConfirmOpen(false);
    setState("installing");
    try {
      const result = await window.electronAPI?.confirmRestartApp?.();
      if (!result?.installing && !result?.relaunch) {
        confirmingRef.current = false;
        setState("ready");
      }
    } catch {
      confirmingRef.current = false;
      setState("ready");
    }
  };

  const showBar = state === "downloading" || state === "installing" || state === "ready";
  const barWidth =
    state === "installing" || state === "ready"
      ? 100
      : percent != null
        ? percent
        : 8;

  return (
    <>
      {state ? (
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
            {state === "ready" ? (
              <button
                type="button"
                className="electron-update-toast-restart"
                onClick={askRestart}
              >
                {t("updateToast.restart")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("updateToast.confirmTitle")}
      >
        <p className="update-restart-copy">
          {t("updateToast.confirmBody", { version: version || "" })}
        </p>
        <div className="update-restart-actions">
          <button
            type="button"
            className="btn btn-secondary"
            autoFocus
            onClick={() => setConfirmOpen(false)}
          >
            {t("updateToast.confirmLater")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={confirmRestart}
          >
            {t("updateToast.confirmRestart")}
          </button>
        </div>
      </Modal>
    </>
  );
}
