/**
 * https://descall.com/passkey/report#t=<token>&a=revoke|confirm: the page behind the
 * "Ben değildim" / "Bendim" buttons of the passkey security e-mails
 * (backend lib/passkeys/securityMail.js). Works without being signed in. The token is read
 * from the fragment and taken off the address bar at once; nothing happens on opening:
 * the page shows what the mail was about and asks once more (link scanners change nothing).
 *   revoke  the passkey is removed and every session of the account ends
 *   confirm the alert is closed
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, ShieldCheck } from "../ui/Icon.jsx";
import { useT, useLocale } from "../../context/LocaleContext";
import { reportInfo, reportResolve, normalizePasskeyError } from "../../lib/passkeys/index.js";
import { fullDate, timeText, placeName } from "./center/centerFormat.js";
import "../../styles/passkeys.css";
import "../../styles/passkey-center.css";

/** { token, action } from "#t=<43 chars>&a=revoke". */
export function reportParamsFromHash(hash) {
  const h = String(hash || "");
  const m = /(?:^#|&)t=([A-Za-z0-9_-]{43})(?:&|$)/.exec(h);
  const a = /(?:^#|&)a=(revoke|confirm)(?:&|$)/.exec(h);
  return { token: m ? m[1] : "", action: a ? a[1] : "" };
}

export default function PasskeyReportPage() {
  const t = useT();
  const { locale } = useLocale();
  const params = useMemo(() => (typeof window !== "undefined" ? reportParamsFromHash(window.location.hash) : { token: "", action: "" }), []);
  const [info, setInfo] = useState(null);
  const [state, setState] = useState(params.token ? "loading" : "invalid"); // loading | ask | busy | done | invalid | expired | network
  const [choice, setChoice] = useState(params.action || "revoke");
  const [result, setResult] = useState(null);

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-react-ready", "1");
      window.__descallDismissBootSplash?.({ minMs: 0 });
      if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchInfo = () => {
    if (!params.token) return;
    setState("loading");
    reportInfo(params.token)
      .then((r) => {
        setInfo(r);
        if (r.resolution) {
          setResult({ resolution: r.resolution, already: true });
          setState("done");
        } else setState("ask");
      })
      .catch((err) => {
        const e = normalizePasskeyError(err);
        setState(e.serverCode === "REPORT_EXPIRED" ? "expired" : e.code === "network" ? "network" : "invalid");
      });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fetchInfo, [params.token]);

  const answer = async () => {
    setState("busy");
    try {
      const r = await reportResolve(params.token, choice);
      setResult(r);
      setState("done");
    } catch (err) {
      const e = normalizePasskeyError(err);
      if (e.serverCode === "ALREADY_RESOLVED") {
        setResult({ resolution: e.body?.resolution || null, already: true });
        setState("done");
      } else setState(e.code === "network" ? "network" : e.serverCode === "REPORT_EXPIRED" ? "expired" : "invalid");
    }
  };

  const place = info ? placeName(info.city, info.country, locale) : "";
  const when = info?.at ? `${fullDate(info.at, locale)} ${timeText(info.at, locale)}` : "";
  const revoked = result?.resolution === "revoked";

  return (
    <main className="pk-desktop-page pkr-page">
      <section className="pk-desktop-card pkr-card heavy" aria-live="polite">
        <span className={`pkc-bigic ${state === "done" ? (revoked ? "r" : "g") : state === "ask" || state === "busy" ? "y" : "b"}`} aria-hidden="true">
          {state === "done" ? revoked ? <ShieldCheck size={28} /> : <CheckCircle2 size={28} /> : state === "ask" || state === "busy" ? <AlertTriangle size={28} /> : <KeyRound size={28} />}
        </span>
        {state === "loading" ? <p className="pk-note">{t("passkey.report.loading")}</p> : null}
        {state === "invalid" ? (
          <>
            <h1>{t("passkey.report.invalidTitle")}</h1>
            <p className="pk-note">{t("passkey.report.invalid")}</p>
          </>
        ) : null}
        {state === "expired" ? (
          <>
            <h1>{t("passkey.report.expiredTitle")}</h1>
            <p className="pk-note">{t("passkey.report.expired")}</p>
            <a className="pkc-btn pri" href="/login">
              {t("passkey.report.openApp")}
            </a>
          </>
        ) : null}
        {state === "network" ? (
          <>
            <p className="pk-error">{t("passkey.report.network")}</p>
            <button type="button" className="pkc-btn" onClick={fetchInfo}>
              {t("passkey.state.retry")}
            </button>
          </>
        ) : null}
        {(state === "ask" || state === "busy") && info ? (
          <>
            <h1>{t(`passkey.report.title.${info.kind === "new_place" ? "newPlace" : "added"}`)}</h1>
            <dl className="pkc-mgrid pkr-facts">
              <dt>{t("passkey.report.passkey")}</dt>
              <dd>{[info.name, info.provider].filter(Boolean).join(" · ") || "Passkey"}</dd>
              <dt>{t("passkey.report.when")}</dt>
              <dd>{when}</dd>
              <dt>{t("passkey.report.place")}</dt>
              <dd>{place || t("passkey.center.drawer.placeUnknown")}</dd>
              {info.device ? (
                <>
                  <dt>{t("passkey.report.device")}</dt>
                  <dd>{info.device}</dd>
                </>
              ) : null}
            </dl>
            <b className="pkr-q">{t("passkey.report.question")}</b>
            <div className="pkr-choices" role="radiogroup" aria-label={t("passkey.report.question")}>
              <button type="button" role="radio" aria-checked={choice === "revoke"} className={`pkr-choice danger${choice === "revoke" ? " on" : ""}`} onClick={() => setChoice("revoke")}>
                <b>{t("passkey.report.notMe")}</b>
                <span>{info.passkeyExists ? t("passkey.report.revokeLead", { name: info.name || "Passkey" }) : t("passkey.report.revokeLeadGone")}</span>
              </button>
              <button type="button" role="radio" aria-checked={choice === "confirm"} className={`pkr-choice${choice === "confirm" ? " on" : ""}`} onClick={() => setChoice("confirm")}>
                <b>{t("passkey.report.itWasMe")}</b>
                <span>{t("passkey.report.confirmLead")}</span>
              </button>
            </div>
            <button type="button" className={`pkc-btn wide ${choice === "revoke" ? "dangerf" : "pri"}`} onClick={answer} disabled={state === "busy"}>
              {state === "busy" ? t("passkey.report.loading") : choice === "revoke" ? t("passkey.report.revokeButton") : t("passkey.report.confirmButton")}
            </button>
          </>
        ) : null}
        {state === "done" ? (
          <>
            <h1>{revoked ? t("passkey.report.doneRevokedTitle") : t("passkey.report.doneConfirmedTitle")}</h1>
            <p className="pk-note">
              {result?.already
                ? t(revoked ? "passkey.report.alreadyRevoked" : "passkey.report.alreadyConfirmed")
                : revoked
                  ? t("passkey.report.doneRevoked", { count: Number(result?.sessionsEnded) || 0 })
                  : t("passkey.report.doneConfirmed")}
            </p>
            <a className="pkc-btn pri" href="/login">
              {revoked ? t("passkey.report.changePassword") : t("passkey.report.openApp")}
            </a>
          </>
        ) : null}
      </section>
    </main>
  );
}
