import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Megaphone, X } from "lucide-react";
import { getToken } from "../../lib/storage";
import { API_BASE_URL } from "../../config/api";
import { useT } from "../../context/LocaleContext";
import { BlockListSkeleton } from "../ui/Skeleton";

/**
 * Same announcements modal as Friends/DM sidebar Megaphone.
 * Activity toolbar had wired Megaphone to feedback by mistake.
 */
export default function AnnouncementsButton({ className = "icon-btn", iconSize = 18 }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || announcements.length > 0) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = getToken();
        const res = await fetch(`${API_BASE_URL}/api/announcements`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled) {
          setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
        }
      } catch (err) {
        console.error("Failed to load announcements:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, announcements.length]);

  const modal =
    typeof document === "undefined"
      ? null
      : createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className="add-modal-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
              >
                <motion.div
                  className="add-modal"
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="add-modal-header">
                    <h3>📢 Announcements</h3>
                    <button type="button" className="icon-btn" onClick={() => setOpen(false)}>
                      <X size={18} />
                    </button>
                  </div>
                  <div className="announcements-modal-content">
                    {loading ? (
                      <BlockListSkeleton count={4} label={t("Loading announcements...")} />
                    ) : announcements.length === 0 ? (
                      <div
                        style={{
                          padding: "16px",
                          color: "var(--text-muted)",
                          fontSize: "14px",
                          textAlign: "center",
                        }}
                      >
                        {t("No announcements")}
                      </div>
                    ) : (
                      announcements.map((a) => (
                        <div key={a.id} className="announcement-item">
                          <div className="announcement-title">{a.title}</div>
                          <div className="announcement-content">{a.content}</div>
                          <div className="announcement-meta">
                            {a.author && (
                              <span className="announcement-author">
                                {t("By {author}", { author: a.author })}
                              </span>
                            )}
                            {a.createdAt && (
                              <span className="announcement-date">
                                {new Date(a.createdAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        );

  return (
    <>
      <button
        type="button"
        className={className}
        title={t("Announcements")}
        onClick={() => setOpen(true)}
      >
        <Megaphone size={iconSize} />
      </button>
      {modal}
    </>
  );
}
