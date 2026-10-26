import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Avatar from "../ui/Avatar";
import { useT, useLocale } from "../../context/LocaleContext";
import { useToast } from "../../context/ToastContext";
import { submitUserReport } from "../../api/reports";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { usePressFeedbackScope } from "../../hooks/usePressFeedback";
import { isBlockedByMe, setUserBlocked } from "../../lib/blockedUsers";
import { reportDoneStep } from "../../lib/reportBlockOffer";
import { hapticImpactMedium, hapticSelection } from "../../lib/fluid/haptics";
import { trAccusative } from "../../lib/trSuffix";
import { useGlassShell } from "../layout/glass/GlassShell";
import "./ProfileSheet.css";
import { MICheck } from "./ProfileSheetIcons.jsx";

// Mockup #30: eight reasons, "Spam veya dolandırıcılık" covers spam + scam.
export const REPORT_SHEET_REASONS = [
  { id: "harassment", labelKey: "report.rHarassment" },
  { id: "hate_speech", labelKey: "report.rHate" },
  { id: "threats", labelKey: "report.rThreat" },
  { id: "spam", labelKey: "report.rSpam" },
  { id: "impersonation", labelKey: "report.rImpersonation" },
  { id: "nsfw", labelKey: "report.rNsfw" },
  { id: "doxxing", labelKey: "report.rDoxxing" },
  { id: "other", labelKey: "report.rOther" },
];

export default function ReportUserModal({
  open,
  onClose,
  targetId,
  targetUsername,
  targetDisplayName,
  targetUser,
  snippet,
  contextType = "profile",
  contextId = null,
  occurredAt = null,
  // A2 §4.6: after a report, offer to block the person too.
  offerBlock = true,
  onBlocked,
}) {
  const t = useT();
  const { locale } = useLocale();
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const glassShell = useGlassShell();
  const layout = glassShell ? "sheet" : "form";
  const cardRef = useRef(null);
  usePressFeedbackScope(cardRef, { enabled: open });
  const [reason, setReason] = useState("harassment");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // "form" → (sent) → "done"; the block alert sits on top of "done".
  const [step, setStep] = useState("form");
  const [alertOpen, setAlertOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockError, setBlockError] = useState("");

  // Parents pass inline onClose handlers; keep the reset effect keyed on
  // open/target only, or a parent re-render (e.g. after blocking) would wipe
  // the done step back to the form.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setReason("harassment");
    setNote("");
    setBusy(false);
    setError("");
    setStep("form");
    setAlertOpen(false);
    setBlockBusy(false);
    setBlockError("");
  }, [open, targetId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (alertOpen) setAlertOpen(false);
      else onCloseRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, alertOpen]);

  const name = targetDisplayName || targetUsername || t("Someone");
  const nameAcc = locale === "tr" ? trAccusative(name) : name;

  const submit = async () => {
    if (!targetId || busy) return;
    setBusy(true);
    setError("");
    try {
      await submitUserReport({
        targetId,
        reason,
        note: note.trim() || undefined,
        contextType,
        contextId,
        snippet,
        occurredAt,
      });
      setStep("done");
      setAlertOpen(reportDoneStep({ offerBlock, alreadyBlocked: isBlockedByMe(targetId) }) === "offer");
    } catch (err) {
      if (err.code === "DUPLICATE") setError(t("report.duplicate"));
      else if (err.code === "RATE_LIMIT") setError(t("report.rateLimit"));
      else if (err.code === "SELF_REPORT") setError(t("report.self"));
      else setError(err.message || t("report.failed"));
    } finally {
      setBusy(false);
    }
  };

  const blockNow = async () => {
    if (!targetId || blockBusy) return;
    setBlockBusy(true);
    setBlockError("");
    try {
      await setUserBlocked(targetId, true);
      hapticImpactMedium();
      onBlocked?.(targetId);
      setAlertOpen(false);
      toast(t("report.blocked"), "success", { duration: 1600 });
    } catch (err) {
      setBlockError(err?.message || t("Something went wrong."));
    } finally {
      setBlockBusy(false);
    }
  };

  if (typeof document === "undefined") return null;

  const isDone = step === "done";
  const surfaceClass = `${layout === "sheet" ? "pfs-sheet" : "pfs-form"} pfs-heavy rps-surface${isDone ? " is-medium" : ""}`;
  const surfaceMotion = layout === "sheet"
    ? {
        initial: reduce ? { opacity: 0 } : { y: 80, opacity: 0 },
        animate: reduce ? { opacity: 1 } : { y: 0, opacity: 1 },
        exit: reduce ? { opacity: 0 } : { y: 700, opacity: 0 },
      }
    : {
        initial: reduce ? { opacity: 0 } : { scale: 0.96, opacity: 0, y: 10 },
        animate: reduce ? { opacity: 1 } : { scale: 1, opacity: 1, y: 0 },
        exit: reduce ? { opacity: 0 } : { scale: 0.97, opacity: 0 },
      };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={`rps-overlay${layout === "form" ? " is-form" : ""}`}
          data-testid="report-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduce ? REDUCED_MOTION_FADE : { duration: 0.2 }}
          onClick={() => { if (!alertOpen) onClose?.(); }}
        >
          <motion.div
            ref={cardRef}
            className={surfaceClass}
            style={layout === "form" ? { "--w": "540px", "--h": isDone ? "420px" : "760px" } : undefined}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-sheet-title"
            data-testid="report-sheet"
            {...surfaceMotion}
            transition={reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.sheet)}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pfs-grab" aria-hidden="true" />
            {isDone ? (
              <>
                <div className="pfs-nav">
                  <span />
                  <span className="t" />
                  <button type="button" className="r" onClick={onClose} data-testid="report-done">
                    {t("report.done")}
                  </button>
                </div>
                <div className="rps-done" role="status">
                  <div className="ck"><MICheck size={32} strokeWidth={3} /></div>
                  <h3 id="report-sheet-title">{t("report.doneTitle")}</h3>
                  <p>{t("report.doneBody")}</p>
                </div>
              </>
            ) : (
              <>
                <div className="pfs-nav">
                  <button type="button" className="l" onClick={onClose} disabled={busy}>
                    {t("report.cancel")}
                  </button>
                  <span className="t" id="report-sheet-title">{t("report.sheetTitle")}</span>
                  <button type="button" className="r" onClick={submit} disabled={busy || !targetId} data-testid="report-submit">
                    {busy ? t("report.sending") : t("report.send")}
                  </button>
                </div>
                <div className="pfs-scroll">
                  <div className="rps-head">
                    <span className="av">
                      <Avatar name={name} size={56} user={targetUser || { id: targetId, username: targetUsername }} />
                    </span>
                    <div className="ttl">{t("report.why", { nameAcc })}</div>
                    <div className="sub">{t("report.anon", { name })}</div>
                  </div>
                  {snippet ? <blockquote className="rps-snippet">“{snippet}”</blockquote> : null}
                  <div className="pfs-sec" id="report-reason-label">{t("report.reasonSection")}</div>
                  <div className="pfs-group rps-reasons" role="radiogroup" aria-labelledby="report-reason-label">
                    {REPORT_SHEET_REASONS.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        role="radio"
                        aria-checked={reason === r.id}
                        className="pfs-row"
                        data-testid={`report-reason-${r.id}`}
                        onClick={() => { hapticSelection(); setReason(r.id); }}
                      >
                        <span className={`rps-radio${reason === r.id ? " is-on" : ""}`} aria-hidden="true" />
                        <span className="lab">{t(r.labelKey)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="pfs-sec">
                    <label htmlFor="report-detail">{t("report.detailSection")}</label>
                  </div>
                  <textarea
                    id="report-detail"
                    className="rps-field"
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 500))}
                    rows={3}
                    placeholder={t("report.detailPlaceholder")}
                  />
                  {error ? <p className="pfs-err" role="alert">{error}</p> : null}
                </div>
              </>
            )}
          </motion.div>
          <AnimatePresence>
            {isDone && alertOpen ? (
              <motion.div
                key="alert"
                className="rps-alert-dim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reduce ? REDUCED_MOTION_FADE : { duration: 0.18 }}
                onClick={(e) => e.stopPropagation()}
              >
                <motion.div
                  className="rps-alert"
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="report-block-title"
                  aria-describedby="report-block-body"
                  data-testid="report-block-offer"
                  initial={reduce ? { opacity: 0 } : { scale: 1.12, opacity: 0 }}
                  animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { scale: 0.96, opacity: 0 }}
                  transition={reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize)}
                >
                  <div className="bd">
                    <h4 id="report-block-title">{t("report.blockOfferTitle")}</h4>
                    <p id="report-block-body">{t("report.blockAlertBody", { name })}</p>
                    {blockError ? <p className="err" role="alert">{blockError}</p> : null}
                  </div>
                  <div className="bt">
                    <button type="button" onClick={() => setAlertOpen(false)} disabled={blockBusy} data-testid="report-block-later">
                      {t("report.blockOfferLater")}
                    </button>
                    <button type="button" className="red" onClick={blockNow} disabled={blockBusy} data-testid="report-block-confirm">
                      {t("report.blockOfferConfirm")}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
