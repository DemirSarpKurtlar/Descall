import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, X, Send, Image, AlertTriangle,
  Star, CheckCircle, Flag, Loader2, ChevronRight, ChevronLeft,
} from "lucide-react";
import { useT } from "../../context/LocaleContext";
import { getToken } from "../../lib/storage";
import { API_BASE_URL } from "../../config/api";

const CATEGORIES = [
  { id: "bug", label: "Bug Report", icon: AlertTriangle, color: "#f23f43" },
  { id: "feature", label: "Feature Request", icon: Star, color: "#6678ff" },
  { id: "improvement", label: "Improvement", icon: CheckCircle, color: "#23a55a" },
  { id: "security", label: "Security Issue", icon: Flag, color: "#f0b232" },
  { id: "other", label: "Other", icon: MessageSquare, color: "#9da5b5" },
];

const PRIORITIES = [
  { id: "low", label: "Low", color: "#23a55a" },
  { id: "medium", label: "Medium", color: "#6678ff" },
  { id: "high", label: "High", color: "#f0b232" },
  { id: "critical", label: "Critical", color: "#f23f43" },
];

export default function FeedbackModal({ isOpen, onClose }) {
  const t = useT();
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("medium");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const resetForm = () => {
    setStep(1);
    setCategory("");
    setPriority("medium");
    setMessage("");
    setAttachments([]);
    setIsSubmitted(false);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (attachments.length + files.length > 5) {
      setError(t("Maximum 5 attachments allowed"));
      return;
    }
    setAttachments((prev) => [...prev, ...files].slice(0, 5));
    setError(null);
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!message.trim()) {
      setError(t("Please enter a message"));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const token = getToken();
      if (!token) {
        throw new Error(t("Please login to submit feedback"));
      }

      const attachmentUrls = [];
      for (const file of attachments) {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch(`${API_BASE_URL}/api/media/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          if (uploadData.url) attachmentUrls.push(uploadData.url);
        }
      }

      const response = await fetch(`${API_BASE_URL}/api/feedback/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category,
          priority,
          message: message.trim(),
          attachments: attachmentUrls,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || t("Failed to submit feedback"));
      }

      setIsSubmitted(true);
      setTimeout(() => handleClose(), 2000);
    } catch (err) {
      setError(err.message || t("Failed to submit feedback"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="feedback-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="feedback-overlay"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="feedback-modal feedback-modal-wizard"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="feedback-header">
              <div className="feedback-header-left">
                <MessageSquare size={20} />
                <h3>{t("Send Feedback")}</h3>
              </div>
              <button type="button" className="feedback-modal-close" onClick={handleClose} aria-label={t("Close")}>
                <X size={18} />
              </button>
            </div>

            {isSubmitted ? (
              <div className="feedback-success">
                <div className="feedback-success-icon">
                  <CheckCircle size={32} />
                </div>
                <h3>{t("Thank You!")}</h3>
                <p>{t("Your feedback has been submitted successfully.")}</p>
              </div>
            ) : (
              <>
                {step === 1 && (
                  <div className="feedback-wizard-step">
                    <p className="feedback-wizard-hint">{t("Select a category:")}</p>
                    <div className="feedback-cat-list" role="list">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          role="listitem"
                          className={`feedback-cat-btn${category === cat.id ? " is-active" : ""}`}
                          onClick={() => {
                            setCategory(cat.id);
                            setStep(2);
                          }}
                        >
                          <cat.icon size={20} style={{ color: cat.color }} aria-hidden />
                          <span>{t(cat.label)}</span>
                          <ChevronRight size={16} className="feedback-cat-chevron" aria-hidden />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="feedback-wizard-step">
                    <p className="feedback-wizard-hint">{t("Select priority:")}</p>
                    <div className="feedback-priority-grid">
                      {PRIORITIES.map((prio) => (
                        <button
                          key={prio.id}
                          type="button"
                          className={`feedback-priority-btn${priority === prio.id ? " is-active" : ""}`}
                          onClick={() => setPriority(prio.id)}
                        >
                          <span>{t(prio.label)}</span>
                          <i className="feedback-priority-dot" style={{ backgroundColor: prio.color }} />
                        </button>
                      ))}
                    </div>
                    <button type="button" className="feedback-submit-btn" onClick={() => setStep(3)}>
                      {t("Continue")}
                      <ChevronRight size={18} />
                    </button>
                    <button type="button" className="feedback-wizard-back" onClick={() => setStep(1)}>
                      <ChevronLeft size={18} />
                      {t("Back")}
                    </button>
                  </div>
                )}

                {step === 3 && (
                  <div className="feedback-wizard-step">
                    <div className="feedback-wizard-meta">
                      <div>
                        <span className="feedback-wizard-meta-label">{t("Category")}</span>
                        <p>{t(CATEGORIES.find((c) => c.id === category)?.label || "Other")}</p>
                      </div>
                      <div>
                        <span className="feedback-wizard-meta-label">{t("Priority")}</span>
                        <p>{t(PRIORITIES.find((p) => p.id === priority)?.label || "Medium")}</p>
                      </div>
                    </div>

                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={t("Describe your feedback in detail...")}
                      className="feedback-textarea"
                      rows={5}
                    />

                    <div className="feedback-attach-row">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        multiple
                        accept="image/*"
                        hidden
                      />
                      <button
                        type="button"
                        className="feedback-attach-btn"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Image size={16} />
                        {t("Attach screenshots ({count}/5)", { count: attachments.length })}
                      </button>
                      {attachments.length > 0 && (
                        <div className="feedback-attach-chips">
                          {attachments.map((file, index) => (
                            <span key={`${file.name}-${index}`} className="feedback-attach-chip">
                              <span className="feedback-attach-name">{file.name}</span>
                              <button type="button" onClick={() => removeAttachment(index)} aria-label={t("Close")}>
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {error && <div className="feedback-wizard-error">{error}</div>}

                    <button
                      type="button"
                      className="feedback-submit-btn"
                      onClick={handleSubmit}
                      disabled={isSubmitting || !message.trim()}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={18} className="spin" />
                          {t("Sending...")}
                        </>
                      ) : (
                        <>
                          <Send size={18} />
                          {t("Submit Feedback")}
                        </>
                      )}
                    </button>
                    <button type="button" className="feedback-wizard-back" onClick={() => setStep(2)}>
                      <ChevronLeft size={18} />
                      {t("Back")}
                    </button>
                  </div>
                )}

                <div className="feedback-progress-dots" aria-hidden>
                  {[1, 2, 3].map((i) => (
                    <span key={i} className={`feedback-progress-dot${i === step ? " is-active" : ""}`} />
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
