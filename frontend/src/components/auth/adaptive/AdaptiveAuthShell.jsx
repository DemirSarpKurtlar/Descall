/**
 * The page around the sign-up card (growth 1B), desktop and phone:
 *   desktop (Electron, Tauri, web app, wide)  live ribbon on top, the card in the middle with
 *                                             the logo and "N people are here", server
 *                                             snippets either side (from 1180 px)
 *   phone (iOS / Android app, narrow web)     the logo head on the first step, then a compact
 *                                             top bar (logo, Descall, "N here"); the submit
 *                                             button sticks to the bottom
 * `children` is the card (AdaptiveAuthCard); `compact` is set on phones.
 */
import { useCallback, useState } from "react";
import { useT } from "../../../context/localeContextInstance";
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

export default function AdaptiveAuthShell({ phone = false, desktopShell = false, renderCard, onOpenLegal, footer = null }) {
  const t = useT();
  const live = useLiveSnippets();
  const [step, setStep] = useState("start");
  const onStepChange = useCallback((s) => setStep(s), []);
  const [leftCol, rightCol] = phone ? [null, null] : liveSides(live, t);
  const compactHead = phone && step !== "start";

  return (
    <main className={`asu-root asu-page${phone ? " is-phone" : ""}${compactHead ? " is-compact" : ""}${desktopShell ? " is-desktop-shell" : ""}`} data-asu-step={step}>
      {phone ? null : <LiveRibbon data={live} />}
      <div className="asu-body">
        {leftCol}
        <div className="asu-center">
          <div className="asu-ptop">
            <Logo className="asu-ptop-logo" />
            <b>Descall</b>
            <span className="asu-sp" />
            <HerePill data={live} short />
          </div>
          <header className="asu-head">
            <Logo className="asu-head-logo" />
            <h1>{t("Welcome to Descall")}</h1>
            <p>{t("Voice, video and text chat. Free.")}</p>
            <HerePill data={live} />
          </header>
          {renderCard({ onStepChange, compact: phone })}
          {footer || <LegalLine t={t} onOpenLegal={onOpenLegal} />}
        </div>
        {rightCol}
      </div>
    </main>
  );
}
