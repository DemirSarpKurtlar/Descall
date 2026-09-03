import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Flag, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { useT } from "../../context/LocaleContext";
import { REPORT_REASONS, submitUserReport } from "../../api/reports";

export default function ReportUserModal({
  open,
  onClose,
  targetId,
  targetUsername,
  snippet,
  contextType = "profile",
  contextId = null,
  occurredAt = null,
}) {
  const t = useT();
  const [reason, setReason] = useState("harassment");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setReason("harassment");
    setNote("");
    setBusy(false);
    setError("");
    setDone(false);
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, targetId]);

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
      setDone(true);
      setTimeout(() => onClose?.(), 900);
    } catch (err) {
      if (err.code === "DUPLICATE") setError(t("report.duplicate"));
      else if (err.code === "RATE_LIMIT") setError(t("report.rateLimit"));
      else if (err.code === "SELF_REPORT") setError(t("report.self"));
      else setError(err.message || t("report.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="report-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="report-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-modal-title"
            initial={{ scale: 0.94, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: "spring", damping: 26, stiffness: 360 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="report-modal-head">
              <div>
                <h2 id="report-modal-title">
                  <Flag size={16} /> {t("report.title", { name: targetUsername || t("Someone") })}
                </h2>
                <p>{t("report.subtitle")}</p>
              </div>
              <button type="button" className="report-modal-close" onClick={onClose} aria-label={t("common.close")}>
                <X size={16} />
              </button>
            </header>

            {done ? (
              <div className="report-modal-done">
                <CheckCircle2 size={28} />
                <p>{t("report.thanks")}</p>
              </div>
            ) : (
              <>
                {snippet ? (
                  <blockquote className="report-modal-snippet">“{snippet}”</blockquote>
                ) : null}

                <div className="report-reason-grid">
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={`report-reason-chip ${reason === r.id ? "active" : ""}`}
                      onClick={() => setReason(r.id)}
                    >
                      {t(r.labelKey)}
                    </button>
                  ))}
                </div>

                <label className="report-modal-note">
                  {t("report.noteLabel")}
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 500))}
                    rows={3}
                    placeholder={t("report.notePlaceholder")}
                  />
                </label>

                {error ? (
                  <p className="report-modal-error">
                    <AlertTriangle size={14} /> {error}
                  </p>
                ) : null}

                <div className="report-modal-actions">
                  <button type="button" className="report-btn ghost" onClick={onClose} disabled={busy}>
                    {t("common.cancel")}
                  </button>
                  <button type="button" className="report-btn danger" onClick={submit} disabled={busy || !targetId}>
                    {busy ? t("report.sending") : t("report.submit")}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
