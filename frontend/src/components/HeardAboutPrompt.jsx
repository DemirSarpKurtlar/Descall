import { useEffect, useRef, useState } from "react";
import { useT } from "../context/LocaleContext";
import { sendHeardAbout } from "../api/auth";
import { getToken } from "../lib/storage";
import { HEARD_ABOUT_OPTIONS, clearHeardAboutPending, isHeardAboutPending } from "../lib/heardAbout";
import "./HeardAboutPrompt.css";

const SHOW_DELAY_MS = 2500;
const THANKS_MS = 1400;

/**
 * "How did you hear about us?" (lib/heardAbout.js): one optional single-choice
 * question, shown once after sign-up as a small card in the corner (a sheet at the
 * bottom on phones). It never covers or blocks the app: no backdrop, the app stays
 * usable, "Skip" or the close button ends it. One tap on an answer sends it.
 */
export default function HeardAboutPrompt({ userId }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const sentRef = useRef(false);

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

  if (!open) return null;

  const finish = (answer) => {
    if (sentRef.current) return;
    sentRef.current = true;
    clearHeardAboutPending();
    const token = getToken();
    if (token) sendHeardAbout(token, answer).catch(() => {});
    if (answer === "skipped") setOpen(false);
    else setDone(true);
  };

  return (
    <section className="heard-about" role="dialog" aria-modal="false" aria-labelledby="heard-about-title">
      <button type="button" className="heard-about__close" onClick={() => finish("skipped")} aria-label={t("Close")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {done ? (
        <p className="heard-about__thanks" role="status">{t("sgx.heard.thanks")}</p>
      ) : (
        <>
          <h2 id="heard-about-title" className="heard-about__title">{t("sgx.heard.title")}</h2>
          <p className="heard-about__lead">{t("sgx.heard.lead")}</p>
          <div className="heard-about__options" role="group" aria-labelledby="heard-about-title">
            {HEARD_ABOUT_OPTIONS.map((id) => (
              <button key={id} type="button" className="heard-about__option" onClick={() => finish(id)}>
                {t(`sgx.heard.option.${id}`)}
              </button>
            ))}
          </div>
          <button type="button" className="heard-about__skip" onClick={() => finish("skipped")}>
            {t("sgx.heard.skip")}
          </button>
        </>
      )}
    </section>
  );
}
