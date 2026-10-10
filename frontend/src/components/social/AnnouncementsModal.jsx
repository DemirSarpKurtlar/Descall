import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Megaphone, X } from "lucide-react";
import { getToken } from "../../lib/storage";
import { API_BASE_URL } from "../../config/api";
import { announcementIcon, loadAnnouncements } from "../../lib/announcements";
import { useT } from "../../context/LocaleContext";
import { BlockListSkeleton } from "../ui/Skeleton";
import useGlassUi from "../../hooks/useGlassUi";

const emptyStyle = {
  padding: "16px",
  color: "var(--text-muted)",
  fontSize: "14px",
  textAlign: "center",
};

function glassAnnouncementWhen(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const min = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (min < 60) return `${Math.max(1, min)}dk`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}sa`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}g`;
  return new Date(iso).toLocaleDateString("tr-TR");
}

/**
 * Same announcements modal as Friends/DM sidebar Megaphone.
 * Activity toolbar had wired Megaphone to feedback by mistake.
 */
export default function AnnouncementsButton({ className = "icon-btn", iconSize = 18 }) {
  const t = useT();
  const glass = useGlassUi();
  const [open, setOpen] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const rows = await loadAnnouncements(API_BASE_URL, getToken());
        if (!cancelled) setAnnouncements(rows);
      } catch (err) {
        console.error("Failed to load announcements:", err);
        if (!cancelled) {
          setAnnouncements([]);
          setError(t("Failed to load announcements"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  const modal =
    typeof document === "undefined"
      ? null
      : createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className={`add-modal-backdrop${glass ? " g-scrim g-announce-scrim" : ""}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
              >
                <motion.div
                  className={`add-modal${glass ? " g-announce" : ""}`}
                  initial={glass ? { opacity: 0 } : { scale: 0.9, opacity: 0, y: 20 }}
                  animate={glass ? { opacity: 1 } : { scale: 1, opacity: 1, y: 0 }}
                  exit={glass ? { opacity: 0 } : { scale: 0.9, opacity: 0, y: 20 }}
                  transition={glass ? { duration: 0.18 } : { type: "spring", damping: 25, stiffness: 300 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="add-modal-header">
                    <h3>{glass ? `📢 ${t("Announcements")}` : "📢 Announcements"}</h3>
                    <button type="button" className="icon-btn" onClick={() => setOpen(false)}>
                      <X size={18} />
                    </button>
                  </div>
                  <div className="announcements-modal-content">
                    {loading ? (
                      <BlockListSkeleton count={4} label={t("Loading announcements...")} />
                    ) : error ? (
                      <div
                        className={glass ? "announcements-empty" : undefined}
                        style={glass ? undefined : emptyStyle}
                      >
                        {error}
                      </div>
                    ) : announcements.length === 0 ? (
                      <div
                        className={glass ? "announcements-empty" : undefined}
                        style={glass ? undefined : emptyStyle}
                      >
                        {t("No announcements")}
                      </div>
                    ) : (
                      announcements.map((a) => {
                        const AnnIcon = glass ? announcementIcon(a.emoji) : null;
                        return (
                        <div key={a.id} className="announcement-item">
                          {glass ? (
                            <span className="g-ann-mark" style={a.color ? { background: a.color } : undefined} aria-hidden="true">
                              {AnnIcon ? <AnnIcon size={18} strokeWidth={2} /> : (a.emoji || "📢")}
                            </span>
                          ) : null}
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
                                {glass ? glassAnnouncementWhen(a.createdAt) : new Date(a.createdAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        );
                      })
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
