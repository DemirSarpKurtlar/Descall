import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "../ui/Icon.jsx";
import { useLocale } from "../../context/LocaleContext";
import { COPYRIGHT_CONTENT, PRIVACY_CONTENT, TERMS_CONTENT } from "../../legal/legalContent";
import LegalDocument from "./LegalDocument";

const CONTENT_BY_TYPE = {
  terms: TERMS_CONTENT,
  privacy: PRIVACY_CONTENT,
  copyright: COPYRIGHT_CONTENT,
};

/**
 * Full-text reader for Terms, Privacy, and Copyright. The words live in
 * legalContent.js so this modal and the marketing pages stay identical.
 */
export default function LegalContentModal({ open, onClose, type = "terms" }) {
  const { locale } = useLocale();
  const reduce = useReducedMotion();
  const scrollRef = useRef(null);
  const data = CONTENT_BY_TYPE[type]?.[locale] || CONTENT_BY_TYPE[type]?.en;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [open, type]);

  if (!data || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="legal-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduce ? { duration: 0.12 } : undefined}
          onClick={(event) => {
            event.stopPropagation();
            onClose?.();
          }}
        >
          <motion.div
            className="legal-modal-card"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 380, damping: 32 }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-doc-title"
          >
            <div className="legal-modal-body" ref={scrollRef}>
              <LegalDocument
                data={data}
                type={type}
                locale={locale}
                actions={
                  <button type="button" className="legal-modal-close" onClick={onClose} aria-label={locale === "tr" ? "Kapat" : "Close"}>
                    <X size={18} />
                  </button>
                }
              />
            </div>
            <footer className="legal-modal-footer">
              <button type="button" className="legal-modal-ok-btn" onClick={onClose}>
                {locale === "tr" ? "Kapat" : "Close"}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
