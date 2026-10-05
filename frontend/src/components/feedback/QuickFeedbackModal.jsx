import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bug, Lightbulb, MessageSquarePlus, Star, X } from "lucide-react";
import { useT } from "../../context/LocaleContext";
import { getToken } from "../../lib/storage";
import { API_BASE_URL } from "../../config/api";
import { markFeedbackSubmitted } from "../../lib/feedbackNudge";

const FEEDBACK_TYPE_TO_CATEGORY = {
  suggestion: "feature",
  bug: "bug",
  praise: "improvement",
};

const RATING_TO_PRIORITY = {
  1: "critical",
  2: "high",
  3: "medium",
  4: "low",
  5: "low",
};

const VALID_TYPES = new Set(["suggestion", "bug", "praise"]);

/**
 * Same feedback sheet as Friends/DM sidebar: Öneri / Hata / Övgü + stars + text.
 * Used by Activity, nudges, and ServerSidebar so every entry point looks identical.
 */
export default function QuickFeedbackModal({
  isOpen,
  onClose,
  initialType = "suggestion",
}) {
  const t = useT();
  const [feedbackType, setFeedbackType] = useState("suggestion");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFeedbackType(VALID_TYPES.has(initialType) ? initialType : "suggestion");
    setFeedbackText("");
    setFeedbackRating(0);
    setFeedbackSending(false);
    setFeedbackSent(false);
  }, [isOpen, initialType]);

  const close = () => {
    setFeedbackSent(false);
    onClose?.();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="feedback-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <motion.div
            className="feedback-modal"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {feedbackSent ? (
              <div className="feedback-success">
                <div className="feedback-success-icon">✓</div>
                <h3>{t("Thanks for your feedback!")}</h3>
                <p>{t("We review every submission and use it to make Descall better.")}</p>
                <button type="button" className="feedback-close-btn" onClick={close}>
                  {t("Close")}
                </button>
              </div>
            ) : (
              <>
                <div className="feedback-header">
                  <div className="feedback-header-left">
                    <MessageSquarePlus size={20} />
                    <h3>{t("Send Feedback")}</h3>
                  </div>
                  <button type="button" className="icon-btn" onClick={close} aria-label={t("Close")}>
                    <X size={18} />
                  </button>
                </div>

                <div className="feedback-type-row">
                  {[
                    { id: "suggestion", label: t("Suggestion"), icon: <Lightbulb size={14} /> },
                    { id: "bug", label: t("Bug Report"), icon: <Bug size={14} /> },
                    { id: "praise", label: t("Praise"), icon: <Star size={14} /> },
                  ].map((ft) => (
                    <button
                      key={ft.id}
                      type="button"
                      className={`feedback-type-btn${feedbackType === ft.id ? " active" : ""}`}
                      onClick={() => setFeedbackType(ft.id)}
                    >
                      {ft.icon} {ft.label}
                    </button>
                  ))}
                </div>

                <div className="feedback-rating-row">
                  <span className="feedback-rating-label">{t("Overall experience")}</span>
                  <div className="feedback-stars">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`feedback-star${feedbackRating >= n ? " active" : ""}`}
                        onClick={() => setFeedbackRating(n)}
                        aria-label={t("{n} star", { n })}
                      >
                        <Star size={18} />
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  className="feedback-textarea"
                  placeholder={
                    feedbackType === "bug"
                      ? t("Describe the bug — what happened and how to reproduce it…")
                      : feedbackType === "praise"
                        ? t("Tell us what you love about Descall…")
                        : t("Share your idea or suggestion…")
                  }
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={5}
                  maxLength={1000}
                />
                <div className="feedback-char-count">{feedbackText.length}/1000</div>

                <button
                  type="button"
                  className="feedback-submit-btn"
                  disabled={feedbackText.trim().length < 5 || feedbackSending}
                  onClick={async () => {
                    if (feedbackText.trim().length < 5) return;
                    setFeedbackSending(true);
                    try {
                      await fetch(`${API_BASE_URL}/api/feedback/submit`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${getToken()}`,
                        },
                        body: JSON.stringify({
                          category: FEEDBACK_TYPE_TO_CATEGORY[feedbackType] || "other",
                          priority: RATING_TO_PRIORITY[feedbackRating] || "medium",
                          message: feedbackText.trim(),
                        }),
                      });
                    } catch (_) {
                      /* ignore — still thank the user */
                    }
                    setFeedbackSending(false);
                    setFeedbackSent(true);
                    markFeedbackSubmitted();
                  }}
                >
                  {feedbackSending ? t("Sending…") : t("Submit Feedback")}
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
