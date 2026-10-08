import { HeadphoneOff, MicOff, VideoOff } from "lucide-react";
import { useT } from "../../context/LocaleContext";

/**
 * Mic-off / headphones-off / camera-off badges for a call participant.
 * Used for local AND remote tiles so every platform (incl. mobile) shows the
 * same state the participant broadcast via `*:media-state`.
 */
export default function ParticipantStateIcons({
  muted = false,
  deafened = false,
  cameraOff = false,
  size = 13,
  className = "",
}) {
  const t = useT();
  if (!muted && !deafened && !cameraOff) return null;
  return (
    <span className={`participant-state-icons ${className}`.trim()}>
      {muted ? (
        <span className="participant-state-icon is-muted" title={t("Muted")} aria-label={t("Muted")} role="img">
          <MicOff size={size} aria-hidden />
        </span>
      ) : null}
      {deafened ? (
        <span className="participant-state-icon is-deafened" title={t("Deafened")} aria-label={t("Deafened")} role="img">
          <HeadphoneOff size={size} aria-hidden />
        </span>
      ) : null}
      {cameraOff ? (
        <span className="participant-state-icon is-camera-off" title={t("Camera off")} aria-label={t("Camera off")} role="img">
          <VideoOff size={size} aria-hidden />
        </span>
      ) : null}
    </span>
  );
}
