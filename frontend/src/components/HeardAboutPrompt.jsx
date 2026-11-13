import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../context/LocaleContext";
import { sendHeardAbout } from "../api/auth";
import { getToken } from "../lib/storage";
import { HEARD_ABOUT_OPTIONS, clearHeardAboutPending, isHeardAboutPending } from "../lib/heardAbout";
import { Search, Sparkles, Camera, Music, Play, UserPlus, Users, MessageSquare, MoreHorizontal, Compass, Check, X } from "./ui/Icon.jsx";
import "./HeardAboutPrompt.css";

const SHOW_DELAY_MS = 2500;
const THANKS_MS = 1400;

const OPTION_ICONS = {
  google: Search,
  ai_assistant: Sparkles,
  instagram: Camera,
  tiktok: Music,
  youtube: Play,
  friend: UserPlus,
  discord: Users,
  forum: MessageSquare,
  other: MoreHorizontal,
};

/**
 * "How did you hear about us?" (lib/heardAbout.js): one optional single-choice question,
 * shown once after sign-up as a centred glass popup (a sheet at the bottom on phones).
 * One tap on an answer sends it; "Skip", the close button, Escape or a click on the
 * backdrop ends it without an answer.
 */
export default function HeardAboutPrompt({ userId }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const sentRef = useRef(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!userId || !isHeardAboutPending(userId)) return undefined;
    const timer = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [userId]);

  useEffect(() => {
    if (!done) return undefined;
    const timer = window.setTimeout(() => setOpen(false), THANKS_MS);
    return () => window.clearTimeout(timer);
  }, [done]);

  const finish = (answer) => {
    if (sentRef.current) return;
    sentRef.current = true;
    clearHeardAboutPending();
    const token = getToken();
    if (token) sendHeardAbout(token, answer).catch(() => {});
    if (answer === "skipped") setOpen(false);
    else setDone(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    cardRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); finish("skipped"); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (prev && typeof prev.focus === "function") prev.focus();
    };
    // finish only reads refs and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="heard-about-scrim" role="presentation" onClick={() => finish("skipped")}>
      <section
        ref={cardRef}
        tabIndex={-1}
        className={`heard-about${done ? " is-done" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="heard-about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="heard-about__close" onClick={() => finish("skipped")} aria-label={t("Close")}>
          <X size={16} strokeWidth={2.2} />
        </button>
        {done ? (
          <div className="heard-about__thanks" role="status">
            <span className="heard-about__thanks-mark" aria-hidden="true"><Check size={26} strokeWidth={3} /></span>
            <p>{t("sgx.heard.thanks")}</p>
          </div>
        ) : (
          <>
            <span className="heard-about__badge" aria-hidden="true"><Compass size={24} strokeWidth={2} /></span>
            <h2 id="heard-about-title" className="heard-about__title">{t("sgx.heard.title")}</h2>
            <p className="heard-about__lead">{t("sgx.heard.lead")}</p>
            <div className="heard-about__options" role="group" aria-labelledby="heard-about-title">
              {HEARD_ABOUT_OPTIONS.map((id) => {
                const Icon = OPTION_ICONS[id] || MoreHorizontal;
                return (
                  <button key={id} type="button" className="heard-about__option" onClick={() => finish(id)}>
                    <span className="heard-about__option-icon" aria-hidden="true"><Icon size={17} strokeWidth={2} /></span>
                    <span className="heard-about__option-label">{t(`sgx.heard.option.${id}`)}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="heard-about__skip" onClick={() => finish("skipped")}>
              {t("sgx.heard.skip")}
            </button>
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}
