/**
 * The page around the sign-up card (growth 1B), desktop and phone:
 *   desktop (Electron, Tauri, web app, wide)  live ribbon on top, the card in the middle with
 *                                             the logo and "N people are here", server
 *                                             snippets either side (from 1180 px)
 *   phone (iOS / Android app, up to 768 px)   draft B "centered card, balanced rhythm": logo,
 *                                             title, card and legal line as one block centered
 *                                             vertically; a bottom strip with the language
 *                                             picker and "N people are here right now". The
 *                                             sign-in step keeps the head ("Welcome back");
 *                                             the other steps and typing in the first field
 *                                             use a compact top bar (logo, Descall, "N here").
 * `children` is the card (AdaptiveAuthCard); `compact` and `phone` are set on phones.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useT } from "../../../context/localeContextInstance";
import { ChevronDown, Globe } from "../../ui/Icon.jsx";
import useLiveSnippets from "./useLiveSnippets.js";
import { LiveRibbon, liveSides, HerePill } from "./LiveSnippets.jsx";
import "../../../styles/adaptive-auth.css";

function Logo({ className }) {
  return (
    <span className={className}>
      <img src={`${import.meta.env?.BASE_URL || "/"}brand/descall-appicon-rounded.svg`} alt="" width={64} height={64} />
    </span>
  );
}

/**
 * "Devam ederek Kullanım Koşulları ve Gizlilik Politikası'nı kabul edersin." with the two names
 * as buttons. The sentence is translated whole; the names go in through marker characters
 * (works with the app and the marketing translators alike).
 */
export function LegalLine({ t, onOpenLegal }) {
  const text = t("By continuing you accept the {terms} and the {privacy}.", { terms: "\u0001", privacy: "\u0002" });
  const parts = String(text).split(/(\u0001|\u0002)/);
  return (
    <p className="asu-legal">
      {parts.map((part, i) =>
        part === "\u0001" ? (
          <button key={i} type="button" onClick={() => onOpenLegal?.("terms")}>
            {t("Terms of Service")}
          </button>
        ) : part === "\u0002" ? (
          <button key={i} type="button" onClick={() => onOpenLegal?.("privacy")}>
            {t("Privacy Policy")}
          </button>
        ) : (
          part
        )
      )}
    </p>
  );
}

/**
 * The phone strip's language picker: a pill (globe, language, chevron) over a native select,
 * so the phone's own picker opens (wheel on iOS, list on Android).
 */
export function LanguagePill() {
  const t = useT();
  const { locale, setLocale, locales } = useLocale();
  const list = Array.isArray(locales) && locales.length ? locales : [{ id: locale, nativeLabel: locale }];
  const current = list.find((l) => l.id === locale) || list[0];
  return (
    <label className="asu-lang">
      <Globe size={16} aria-hidden="true" />
      <span>{current?.nativeLabel || current?.id}</span>
      <ChevronDown size={14} aria-hidden="true" />
      <select value={current?.id || locale} onChange={(e) => setLocale?.(e.target.value)} aria-label={t("Language")}>
        {list.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nativeLabel || l.id}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Phone keyboard: the part of the layout viewport the keyboard covers goes into --asu-kb
 * (bottom padding, so the page can scroll that far) and the focused field is brought to
 * the middle of what is left. Android resizes the viewport itself (--asu-kb stays 0).
 */
function usePhoneKeyboard(ref, enabled) {
  useEffect(() => {
    const el = ref.current;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!enabled || !el) return undefined;
    let timer = 0;
    const field = () => {
      const a = document.activeElement;
      return a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) ? a : null;
    };
    const reveal = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const a = field();
        if (!a) return;
        const r = a.getBoundingClientRect();
        const bottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
        if (r.top < 8 || r.bottom > bottom - 8) a.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 280);
    };
    const measure = () => {
      const kb = vv && field() ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
      el.style.setProperty("--asu-kb", `${kb}px`);
      if (kb > 0) reveal();
    };
    el.addEventListener("focusin", reveal);
    el.addEventListener("focusout", measure);
    vv?.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("focusin", reveal);
      el.removeEventListener("focusout", measure);
      vv?.removeEventListener("resize", measure);
      el.style.removeProperty("--asu-kb");
    };
  }, [ref, enabled]);
}

export default function AdaptiveAuthShell({ phone = false, desktopShell = false, renderCard, onOpenLegal, footer = null }) {
  const t = useT();
  const live = useLiveSnippets();
  const [step, setStep] = useState("start");
  const onStepChange = useCallback((s) => setStep(s), []);
  const [leftCol, rightCol] = phone ? [null, null] : liveSides(live, t);
  // Draft B: the start and the sign-in step keep the logo head; the rest use the top bar.
  const compactHead = phone && step !== "start" && step !== "login";
  const signIn = phone && step === "login";
  const pageRef = useRef(null);
  usePhoneKeyboard(pageRef, phone);

  return (
    <main
      ref={pageRef}
      className={`asu-root asu-page${phone ? " is-phone" : ""}${compactHead ? " is-compact" : ""}${desktopShell ? " is-desktop-shell" : ""}`}
      data-asu-step={step}
    >
      {phone ? null : <LiveRibbon data={live} />}
      <div className="asu-body">
        {leftCol}
        {phone ? (
          <div className="asu-ptop">
            <Logo className="asu-ptop-logo" />
            <b>Descall</b>
            <span className="asu-sp" />
            <HerePill data={live} short />
          </div>
        ) : null}
        <div className="asu-center">
          {phone ? null : (
            <div className="asu-ptop">
              <Logo className="asu-ptop-logo" />
              <b>Descall</b>
              <span className="asu-sp" />
              <HerePill data={live} short />
            </div>
          )}
          <header className="asu-head">
            <Logo className="asu-head-logo" />
            <h1>{signIn ? t("Welcome back") : t("Welcome to Descall")}</h1>
            <p>{signIn ? t("We recognized your account, no need to type it again.") : t("Voice, video and text chat. Free.")}</p>
            {phone ? null : <HerePill data={live} />}
          </header>
          {renderCard({ onStepChange, compact: phone, phone })}
          {footer || <LegalLine t={t} onOpenLegal={onOpenLegal} />}
        </div>
        {phone ? (
          <div className="asu-pfoot">
            <LanguagePill />
            <HerePill data={live} />
          </div>
        ) : null}
        {rightCol}
      </div>
    </main>
  );
}
