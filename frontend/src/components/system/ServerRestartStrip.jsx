import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../../context/LocaleContext";
import { RefreshCw } from "../ui/Icon.jsx";
import "../../styles/server-restart-strip.css";

function clock(sec) {
  const s = Math.max(0, Math.ceil(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * What every user sees during Sistem › Güvenli yeniden başlat: a strip with the
 * countdown the server sent (`server:restarting`), then "reconnecting" until the
 * socket connects again. Old apps without this strip just reconnect.
 */
export default function ServerRestartStrip({ socket }) {
  const { t } = useLocale();
  const [endsAt, setEndsAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!socket) return undefined;
    const onRestart = (p = {}) => {
      const end = Date.parse(p.endsAt);
      setEndsAt(Number.isFinite(end) ? end : Date.now() + (Number(p.countdownSec) || 0) * 1000);
      setNow(Date.now());
    };
    const onConnect = () => setEndsAt((v) => (v != null && Date.now() > v ? null : v));
    socket.on("server:restarting", onRestart);
    socket.on("connect", onConnect);
    return () => {
      socket.off("server:restarting", onRestart);
      socket.off("connect", onConnect);
    };
  }, [socket]);

  useEffect(() => {
    if (endsAt == null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    // Never stay forever if the reconnect event was missed.
    const stop = setTimeout(() => setEndsAt(null), Math.max(0, endsAt - Date.now()) + 3 * 60 * 1000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [endsAt]);

  if (endsAt == null || typeof document === "undefined") return null;
  const left = (endsAt - now) / 1000;
  return createPortal(
    <div className="srs" role="status" aria-live="polite" data-testid="server-restart-strip">
      <RefreshCw size={16} className={left <= 0 ? "srs-spin" : ""} />
      <span>{left > 0 ? t("sysx.strip.text") : t("sysx.strip.reconnecting")}</span>
      {left > 0 ? <b>{clock(left)}</b> : null}
    </div>,
    document.body
  );
}
