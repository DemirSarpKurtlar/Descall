import { useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { MonitorUp, StopCircle, X } from "../ui/Icon.jsx";
import { formatShareElapsed } from "../../lib/iosScreenBroadcastModel";
import "../../styles/ios-broadcast-share.css";

/**
 * Voice dock status for the iPhone / iPad whole-screen broadcast
 * (useServerVoice `nativeScreenShare`, docs/ios-screen-share.md):
 * preparing -> system picker -> live (timer, Stop) -> stopping.
 * The share can also be stopped from the red status pill or Control Center;
 * the chip follows the native state either way.
 */
export default function IosBroadcastShareChip({ share, onStop }) {
  const t = useT();
  const phase = share?.phase || "idle";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (phase !== "live") return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  if (phase === "idle") return null;

  const live = phase === "live";
  const title = live
    ? t("iosShare.liveTitle")
    : phase === "picker"
      ? t("iosShare.pickerTitle")
      : phase === "stopping"
        ? t("iosShare.stoppingTitle")
        : t("iosShare.preparingTitle");
  const hint = live ? t("iosShare.liveHint") : phase === "picker" ? t("iosShare.pickerHint") : null;
  const actionLabel = live ? t("iosShare.stop") : t("iosShare.cancel");

  return (
    <div
      className={`ibs-chip is-${phase}`}
      role="status"
      aria-live="polite"
    >
      <span className="ibs-icon" aria-hidden="true">
        <MonitorUp size={16} />
        {live ? <span className="ibs-dot" /> : null}
      </span>
      <span className="ibs-text">
        <span className="ibs-title">
          {title}
          {live ? <span className="ibs-time">{formatShareElapsed(share?.startedAt, now)}</span> : null}
        </span>
        {hint ? <span className="ibs-hint">{hint}</span> : null}
      </span>
      {phase !== "stopping" ? (
        <button
          type="button"
          className={`ibs-action${live ? " is-stop" : ""}`}
          onClick={() => onStop?.()}
          aria-label={live ? t("iosShare.stopAria") : t("iosShare.cancelAria")}
        >
          {live ? <StopCircle size={15} /> : <X size={15} />}
          <span>{actionLabel}</span>
        </button>
      ) : null}
    </div>
  );
}
