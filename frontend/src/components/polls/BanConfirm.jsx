import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Ban } from "../ui/Icon.jsx";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { hapticWarning } from "../../lib/fluid/haptics";
import { Portal } from "./dsxShared";
import { useT } from "../../context/LocaleContext";
import "./dsx.css";

/** "/ban" safety step: "Ban X?" with an editable reason. */
export default function BanConfirm({ targetName, reason: initialReason = "", onCancel, onConfirm }) {
  const t = useT();
  const reduce = useReducedMotion();
  const [reason, setReason] = useState(initialReason);
  const confirmRef = useRef(null);
  useEffect(() => {
    hapticWarning();
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <Portal>
      <motion.div className="dsx-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} />
      <div className="dsx-sheetwrap" style={{ pointerEvents: "none" }}>
        <motion.div
          role="alertdialog"
          aria-modal="true"
          aria-label={t("polls.ban.title", { name: targetName })}
          className="dsx-heavy dsx-confirm dsx-ac"
          style={{ pointerEvents: "auto" }}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
          transition={reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.sheet || SPRINGS.default)}
        >
          <div className="h">
            <span className="hi" style={{ background: "linear-gradient(160deg,#ff5a6b,#b8233f)" }}>
              <Ban className="dsx-ico" />
            </span>
            <div>
              <b>{t("polls.ban.title", { name: targetName })}</b>
              <span>{t("polls.ban.body")}</span>
            </div>
          </div>
          <div className="dsx-lbl" style={{ margin: "16px 2px 6px" }}>
            {t("polls.reason")} <i>{t("polls.ban.reasonNote")}</i>
          </div>
          <input
            className="dsx-fld"
            style={{ height: 40, fontSize: 13.5, marginBottom: 14, width: "100%", boxSizing: "border-box" }}
            value={reason}
            maxLength={400}
            placeholder={t("polls.ban.placeholder")}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onConfirm?.(reason.trim());
              }
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="dsx-btn ghost" style={{ flex: 1 }} onClick={onCancel}>
              {t("polls.cancel")}
            </button>
            <button ref={confirmRef} type="button" className="dsx-btn dng" style={{ flex: 1 }} onClick={() => onConfirm?.(reason.trim())}>
              <Ban className="dsx-ico" /> {t("polls.ban.confirm")}
            </button>
          </div>
        </motion.div>
      </div>
    </Portal>
  );
}
