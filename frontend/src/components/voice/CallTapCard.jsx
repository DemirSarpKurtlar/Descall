import { createPortal } from "react-dom";
import { Phone, PhoneOff, Users, X } from "../ui/Icon.jsx";
import { useT } from "../../context/LocaleContext";

/**
 * 3.0.0 (C3): result of tapping a call notification when the call can't be
 * connected straight away.
 *  - kind "group-join": "Aramaya katıl" card (a group push never auto-joins).
 *  - kind "ended":      "Arama sona erdi" + "Geri ara" (DM) / "Kapat".
 * Centered with left/right margins (never translateX(-50%)), portal to body.
 */
export default function CallTapCard({ card, onJoin, onCallBack, onClose }) {
  const t = useT();
  if (!card || typeof document === "undefined") return null;
  const isJoin = card.kind === "group-join";
  const title = isJoin ? card.groupName || t("Group call") : t("Call ended");
  const subtitle = isJoin
    ? card.callType === "video"
      ? t("Group video call in progress")
      : t("Group voice call in progress")
    : card.peerName || card.groupName || "";
  const canCallBack = !isJoin && Boolean(card.peerId);

  const btn = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    padding: "0 18px",
    borderRadius: 999,
    border: 0,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    color: "#fff",
  };

  return createPortal(
    <div
      className="call-tap-card"
      role="dialog"
      aria-live="polite"
      style={{
        position: "fixed",
        top: "calc(16px + env(safe-area-inset-top, 0px))",
        left: 16,
        right: 16,
        maxWidth: 420,
        marginLeft: "auto",
        marginRight: "auto",
        zIndex: 10050,
        padding: 16,
        borderRadius: 24,
        background: "rgba(22,24,30,0.78)",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.35)",
        color: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            background: isJoin ? "rgba(52,199,89,0.22)" : "rgba(255,69,58,0.22)",
            flexShrink: 0,
          }}
        >
          {isJoin ? <Users size={20} /> : <PhoneOff size={20} />}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          {subtitle ? (
            <div style={{ fontSize: 13, opacity: 0.72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Close")}
          style={{ ...btn, minHeight: 36, width: 36, padding: 0, background: "rgba(255,255,255,0.12)" }}
        >
          <X size={18} />
        </button>
      </div>
      {isJoin || canCallBack ? (
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {isJoin ? (
            <button type="button" onClick={onJoin} style={{ ...btn, flex: 1, background: "#34c759" }}>
              <Phone size={18} />
              {t("Join the call")}
            </button>
          ) : (
            <button type="button" onClick={onCallBack} style={{ ...btn, flex: 1, background: "#34c759" }}>
              <Phone size={18} />
              {t("Call back")}
            </button>
          )}
        </div>
      ) : null}
    </div>,
    document.body
  );
}
