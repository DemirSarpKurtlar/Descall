import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { API_BASE_URL } from "../../config/api";
import { useLocale } from "../../context/LocaleContext";
import { detectPlatform, shouldBlock, shouldShowBanner, localStatus } from "../../lib/maintenance";
import { MaintenanceScreen, MaintenanceBanner, MaintenanceDetails, MaintenanceEndedToast } from "./MaintenanceUi";
import "../../styles/maintenance.css";

const DISMISS_KEY = "descall:maint-banner-dismissed";
const NOTIFY_KEY = "descall:maint-notify";

function readLs(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function writeLs(k, v) {
  try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ }
}

/**
 * User side of maintenance on every platform: the full screen while a window
 * is active (admins pass when the window allows it), the glass banner before
 * it, and the "it's over" toast. State comes from GET /api/maintenance/status
 * and the `maintenance:state` / `maintenance:ended` socket events.
 */
export default function MaintenanceGate({ socket, isAdmin = false }) {
  const { t, locale } = useLocale();
  const platform = useMemo(() => detectPlatform(), []);
  const [m, setM] = useState(null);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [retrying, setRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(() => readLs(DISMISS_KEY));
  const [notifyFor, setNotifyFor] = useState(() => readLs(NOTIFY_KEY));
  const [details, setDetails] = useState(false);
  const [ended, setEnded] = useState(false);
  const lastActiveId = useRef(null);

  const apply = useCallback((payload) => {
    if (!payload || !("maintenance" in payload)) return;
    setM(payload.maintenance || null);
    const st = Date.parse(payload.serverTime);
    if (Number.isFinite(st)) setSkew(st - Date.now());
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/maintenance/status`, { cache: "no-store" });
      if (res.ok) apply(await res.json());
    } catch {
      /* offline: keep the last state */
    }
  }, [apply]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const announceEnd = useCallback(() => {
    setEnded(true);
    if (readLs(NOTIFY_KEY)) {
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Descall", { body: t("maint.endedToast") });
      } catch { /* not supported */ }
      writeLs(NOTIFY_KEY, null);
      setNotifyFor(null);
    }
    setTimeout(() => setEnded(false), 8000);
  }, [t]);

  useEffect(() => {
    if (!socket) return undefined;
    const onState = (p) => apply(p);
    const onEnded = (p = {}) => {
      if (p.notify || readLs(NOTIFY_KEY) === p.id || lastActiveId.current === p.id) announceEnd();
      refresh();
    };
    socket.on("maintenance:state", onState);
    socket.on("maintenance:ended", onEnded);
    return () => {
      socket.off("maintenance:state", onState);
      socket.off("maintenance:ended", onEnded);
    };
  }, [socket, apply, refresh, announceEnd]);

  const cur = now + skew;
  const blocking = shouldBlock(m, { platform, isAdmin, now: cur });
  const banner = !blocking && shouldShowBanner(m, { platform, now: cur, dismissedId: dismissed });
  const watching = Boolean(m) && (localStatus(m, cur) === "active" || localStatus(m, cur) === "scheduled" || localStatus(m, cur) === "pending");

  useEffect(() => {
    if (!watching && !ended) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [watching, ended]);

  // Window ran out on the local clock: confirm with the server, then lift the screen.
  useEffect(() => {
    if (blocking) lastActiveId.current = m?.id || null;
    if (m && localStatus(m, cur) === "completed") {
      setM(null);
      if (lastActiveId.current === m.id) announceEnd();
      refresh();
    }
  }, [blocking, m, cur, refresh, announceEnd]);

  if (typeof document === "undefined") return null;
  const isElectron = platform === "electron";

  const onNotify = async () => {
    if (notifyFor) {
      writeLs(NOTIFY_KEY, null);
      setNotifyFor(null);
      return;
    }
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") await Notification.requestPermission();
    } catch { /* ignore */ }
    writeLs(NOTIFY_KEY, m?.id || "1");
    setNotifyFor(m?.id || "1");
  };

  return createPortal(
    <>
      {blocking && (
        <MaintenanceScreen
          m={m}
          now={cur}
          t={t}
          locale={locale}
          titlebar={isElectron}
          retrying={retrying}
          onRetry={async () => { setRetrying(true); await refresh(); setRetrying(false); }}
          notifyArmed={Boolean(notifyFor)}
          onNotify={onNotify}
        />
      )}
      {banner && !details && (
        <MaintenanceBanner
          m={m}
          now={cur}
          t={t}
          locale={locale}
          onDetails={() => setDetails(true)}
          onDismiss={() => { writeLs(DISMISS_KEY, m.id); setDismissed(m.id); }}
        />
      )}
      {banner && details && <MaintenanceDetails m={m} now={cur} t={t} locale={locale} onClose={() => setDetails(false)} />}
      {ended && !blocking && <MaintenanceEndedToast t={t} onClose={() => setEnded(false)} />}
    </>,
    document.body
  );
}
