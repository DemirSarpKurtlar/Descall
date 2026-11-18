import { useEffect, useRef, useState } from "react";
import { useT } from "../context/LocaleContext";
import Modal from "./ui/Modal";
import { Download, RefreshCw, CheckCircle, AlertTriangle, X } from "./ui/Icon";
import "../styles/update-toast.css";
import { getVoiceBusy, subscribeVoiceBusy } from "../lib/voiceBusy";
import { getActivityBusy, subscribeActivityBusy, updateChipKey } from "../lib/updateTiming";

/**
 * Desktop update card (3.7.14 redesign): the same theme glass as the
 * friend-online toast (styles/update-toast.css), an icon tile, title +
 * one-line status and a thin brand-colour progress line along the bottom
 * edge. Downloading / installing sit top centre and never take clicks;
 * "ready" is a small chip bottom right with "Şimdi yükle".
 * Does not steal focus (render-only; Electron showsInactive for OS notifs).
 */
const UPDATE_DOWNLOAD_PAGE = "https://github.com/DemirSarpKurtlar/Descall/releases/latest";

export default function ElectronUpdateToast() {
  const t = useT();
  const [state, setState] = useState(null); // null | downloading | installing | ready | error
  const [version, setVersion] = useState(null);
  const [percent, setPercent] = useState(null);
  const [deferred, setDeferred] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(() => getVoiceBusy());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmingRef = useRef(false);

  const [activityBusy, setActivityBusy] = useState(() => getActivityBusy());
  useEffect(() => subscribeVoiceBusy(setVoiceBusy), []);
  useEffect(() => subscribeActivityBusy(setActivityBusy), []);

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
        api.onUpdateError(({ phase } = {}) => {
          // A visible download that failed gets a card with retry and the download page;
          // a quiet background check that failed stays quiet (polish pass: the card used
          // to vanish without a word and flash back every five minutes).
          setPercent(null);
          setState((prev) => (phase === "download" || prev === "downloading" ? "error" : prev === "ready" ? prev : null));
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
        ? t(updateChipKey({ voiceBusy: heldForCall || deferred, activityBusy }), { version: version || "" })
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

  const retryUpdate = async () => {
    setState("downloading");
    setPercent(0);
    try {
      const res = await window.electronAPI?.checkForUpdates?.();
      if (!res?.success) setState("error");
      else if (res?.updateReady) setState("ready");
      // Nothing newer (or the download already reported): drop the card unless an event moved it on.
      else if (!res?.available) setState((prev) => (prev === "downloading" ? null : prev));
    } catch {
      setState("error");
    }
  };
  const openDownloadPage = () => {
    // setWindowOpenHandler hands https links to the OS browser.
    window.open(UPDATE_DOWNLOAD_PAGE, "_blank", "noopener");
  };

  const barWidth =
    state === "installing" || state === "ready"
      ? 100
      : percent != null
        ? percent
        : 0;
  const v = { version: version || "" };
  const title =
    state === "error"
      ? t("updateToast.titleError")
      : state === "installing"
      ? t("updateToast.titleInstalling", v)
      : state === "ready"
        ? label
        : t("updateToast.titleDownloading", v);
  const sub =
    state === "error"
      ? t("updateToast.subError")
      : state === "installing"
      ? t("updateToast.subInstalling")
      : state === "downloading"
        ? percent != null && percent > 0
          ? t("updateToast.subDownloading", { percent: Math.round(percent) })
          : t("updateToast.subDownloadingStart")
        : null;
  const StateIcon = state === "error" ? AlertTriangle : state === "ready" ? CheckCircle : state === "installing" ? RefreshCw : Download;
  const isChip = state === "ready" || state === "error";

  return (
    <>
      {state ? (
        <div
          className={`electron-update-toast is-${state}${isChip ? " is-chip" : ""}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="eut-card">
            <span className="eut-ic" aria-hidden="true">
              <StateIcon size={18} weight="bold" />
            </span>
            <span className="eut-copy">
              <b>{title}</b>
              {sub ? <span>{sub}</span> : null}
            </span>
            {state === "ready" ? (
              <button type="button" className="eut-btn" onClick={askRestart}>
                {t("updateToast.installNow")}
              </button>
            ) : null}
            {state === "error" ? (
              <>
                <button type="button" className="eut-btn" onClick={retryUpdate}>
                  {t("updateToast.retry")}
                </button>
                <button type="button" className="eut-btn is-ghost" onClick={openDownloadPage}>
                  {t("updateToast.downloadPage")}
                </button>
                <button type="button" className="eut-x" onClick={() => setState(null)} aria-label={t("Close")}>
                  <X size={14} weight="bold" />
                </button>
              </>
            ) : null}
            {!isChip ? (
              <span
                className="eut-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(barWidth)}
              >
                <span className={`eut-bar-fill${state === "downloading" && !percent ? " is-indeterminate" : ""}`} style={{ width: `${barWidth}%` }} />
              </span>
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
