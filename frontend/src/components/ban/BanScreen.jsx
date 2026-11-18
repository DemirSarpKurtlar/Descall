import { useEffect, useRef, useState } from "react";
import useModalFocus from "../../hooks/useModalFocus";
import { createPortal } from "react-dom";
import { Ban, Download, LogOut, Mail, MessageCircle, Trash2, WifiOff } from "../ui/Icon.jsx";
import { useLocale, useT } from "../../context/LocaleContext";
import { formatDate } from "../../i18n/format.js";
import { serverMessage } from "../../i18n/serverText.js";
import { deleteBannedAccount, exportBannedAccount, sendAccessAppeal, sendBanAppeal } from "../../api/ban.js";
import {
  APPEAL_MAX,
  appealTextError,
  banLengthDays,
  banLengthHours,
  isEmail,
  remainingParts,
} from "../../lib/banState.js";
import "./ban-screen.css";

const SUPPORT_EMAIL = "support@descall.com";

/**
 * Full-screen ban notice (owner-approved drafts, docs/design/ban-experience): an account banned
 * by an admin (timed with a countdown, or permanent), a blocked device / network, and a ban that
 * lands while the app is open. Shows the reason in the user's language, the decision and end
 * dates, the admin's note, and lets the user appeal, download their data or delete the account
 * with the short-lived ban ticket (lib/banState.js, api/ban.js).
 *
 * `preview` renders the card alone (no portal, no clock) for the admin ban dialog.
 */
export default function BanScreen({ state, onClose, preview = false, now: fixedNow }) {
  const t = useT();
  const { locale } = useLocale();
  const [now, setNow] = useState(() => fixedNow || Date.now());
  const [view, setView] = useState("main");
  const cardRef = useRef(null);
  useModalFocus(!preview, cardRef);
  const [appeal, setAppeal] = useState(state?.appeal || { status: "none", canAppeal: true });
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (preview || fixedNow) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [preview, fixedNow]);

  useEffect(() => {
    setAppeal(state?.appeal || { status: "none", canAppeal: true });
    setView("main");
    setError("");
  }, [state]);

  useEffect(() => {
    if (preview) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && view !== "main") setView("main");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, view]);

  if (!state) return null;
  const isAccess = state.kind === "access";
  const ban = state.ban || {};
  const access = state.access || {};
  const ticket = state.ticket || null;
  const expiresAt = isAccess ? access.expiresAt : ban.expiresAt;
  const left = remainingParts(expiresAt, fixedNow || now);
  const date = (iso, withTime = true) => {
    if (!iso) return null;
    try {
      return formatDate(iso, locale, withTime ? { dateStyle: "long", timeStyle: "short" } : { dateStyle: "long" });
    } catch {
      return null;
    }
  };
  const fail = (err, fallbackKey) => setError(serverMessage(err?.body) || (err?.message ? t(err.message) : t(fallbackKey)));

  const categoryLabel = ban.categoryId === "other" || !ban.reason ? t("ban.categoryOther") : t(ban.reason);
  const days = banLengthDays(ban.bannedAt, ban.expiresAt);
  const hours = days ? null : banLengthHours(ban.bannedAt, ban.expiresAt);
  const duration = days ? t("ban.days", { count: days }) : hours ? t("ban.hours", { count: hours }) : null;

  let title;
  let lead;
  if (isAccess) {
    title = t("ban.accessTitle");
    lead = t("ban.accessLead");
  } else if (state.live) {
    title = t("ban.liveTitle");
    lead = ban.expiresAt
      ? duration
        ? t("ban.liveLeadTimed", { duration })
        : t("ban.liveLeadTemp")
      : t("ban.liveLeadPermanent");
  } else if (ban.expiresAt) {
    title = duration ? t("ban.timedTitle", { duration }) : t("ban.timedTitleGeneric");
    lead = ban.username ? t("ban.timedLeadUser", { username: ban.username }) : t("ban.timedLead");
  } else {
    title = t("ban.permanentTitle");
    lead = ban.username ? t("ban.permanentLeadUser", { username: ban.username }) : t("ban.permanentLead");
  }

  const accessScope =
    access.kind === "device" ? t("ban.scopeDevice") : access.kind === "ip" ? t("ban.scopeIp") : access.kind === "network" ? t("ban.scopeNetwork") : t("ban.scopeBoth");

  const canAppeal = isAccess ? true : Boolean(ticket) && appeal.canAppeal !== false && appeal.status === "none";

  const submitAppeal = async (e) => {
    e?.preventDefault?.();
    const problem = appealTextError(text);
    if (problem) {
      setError(t(problem === "short" ? "ban.appealTooShort" : "ban.appealTooLong"));
      return;
    }
    if (isAccess && !isEmail(email)) {
      setError(t("ban.appealEmailInvalid"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (isAccess) {
        await sendAccessAppeal({ code: access.code, email: email.trim(), text: text.trim() });
        setAppeal({ status: "pending", canAppeal: false });
      } else {
        const data = await sendBanAppeal(ticket, text.trim());
        setAppeal({ ...(data?.appeal || {}), status: data?.appeal?.status || "pending", canAppeal: false });
      }
      setView("sent");
    } catch (err) {
      fail(err, "ban.appealFailed");
    } finally {
      setBusy(false);
    }
  };

  const downloadData = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await exportBannedAccount(ticket);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "descall-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      fail(err, "ban.exportFailed");
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteBannedAccount(ticket);
      setView("deleted");
    } catch (err) {
      fail(err, "ban.deleteFailed");
    } finally {
      setBusy(false);
    }
  };

  const guidelinesUrl = `https://descall.com${locale === "tr" ? "/kosullar" : "/terms"}`;
  const Seal = isAccess ? WifiOff : Ban;

  let body;
  if (view === "appeal") {
    body = (
      <form className="ban-form" onSubmit={submitAppeal}>
        <h2 id="ban-title">{t("ban.appealTitle")}</h2>
        <p className="ban-lead">{isAccess ? t("ban.appealLeadAccess") : t("ban.appealLead")}</p>
        {isAccess ? (
          <label className="ban-field">
            <span>{t("ban.appealEmail")}</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} required />
          </label>
        ) : null}
        <label className="ban-field">
          <span>{t("ban.appealText")}</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={APPEAL_MAX} rows={6} placeholder={t("ban.appealPlaceholder")} autoFocus />
          <em className="ban-count">{`${text.trim().length}/${APPEAL_MAX}`}</em>
        </label>
        {error ? <p className="ban-error" role="alert">{error}</p> : null}
        <div className="ban-acts">
          <button type="submit" className="ban-btn is-primary" disabled={busy}>
            {busy ? t("ban.sending") : t("ban.appealSend")}
          </button>
          <button type="button" className="ban-btn" onClick={() => { setView("main"); setError(""); }} disabled={busy}>
            {t("ban.back")}
          </button>
        </div>
      </form>
    );
  } else if (view === "sent") {
    body = (
      <div className="ban-done">
        <h2 id="ban-title">{t("ban.appealSentTitle")}</h2>
        <p className="ban-lead">{t("ban.appealSentLead")}</p>
        <div className="ban-acts">
          <button type="button" className="ban-btn" onClick={() => setView("main")}>{t("ban.back")}</button>
        </div>
      </div>
    );
  } else if (view === "delete") {
    body = (
      <div className="ban-done">
        <h2 id="ban-title">{t("ban.deleteTitle")}</h2>
        <p className="ban-lead">{t("ban.deleteLead")}</p>
        {error ? <p className="ban-error" role="alert">{error}</p> : null}
        <div className="ban-acts">
          <button type="button" className="ban-btn is-danger" onClick={deleteAccount} disabled={busy}>
            <Trash2 size={16} aria-hidden="true" />
            {busy ? t("ban.deleting") : t("ban.deleteConfirm")}
          </button>
          <button type="button" className="ban-btn" onClick={() => setView("main")} disabled={busy}>{t("ban.back")}</button>
        </div>
      </div>
    );
  } else if (view === "deleted") {
    body = (
      <div className="ban-done">
        <h2 id="ban-title">{t("ban.deletedTitle")}</h2>
        <p className="ban-lead">{t("ban.deletedLead")}</p>
        <div className="ban-acts">
          <button type="button" className="ban-btn" onClick={onClose}>{t("ban.ok")}</button>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <span className={`ban-kicker${isAccess ? " is-access" : ""}`}>{isAccess ? t("ban.kickerAccess") : t("ban.kicker")}</span>
        <h2 id="ban-title">{title}</h2>
        <p className="ban-lead">{lead}</p>
        {!isAccess && left && !state.live ? (
          <div className="ban-countdown" aria-label={t("ban.timeLeft")}>
            <div><b>{left.days}</b><span>{t("ban.unitDays")}</span></div>
            <div><b>{left.hours}</b><span>{t("ban.unitHours")}</span></div>
            <div><b>{left.minutes}</b><span>{t("ban.unitMinutes")}</span></div>
          </div>
        ) : null}
        <dl className="ban-facts">
          {isAccess ? (
            <div><dt>{t("ban.scope")}</dt><dd>{accessScope}</dd></div>
          ) : (
            <div><dt>{t("ban.reason")}</dt><dd className="is-red">{categoryLabel}</dd></div>
          )}
          {(isAccess ? access.createdAt : ban.bannedAt) && !state.live ? (
            <div><dt>{t("ban.decidedAt")}</dt><dd>{date(isAccess ? access.createdAt : ban.bannedAt, !isAccess)}</dd></div>
          ) : null}
          {expiresAt ? (
            <div><dt>{t("ban.endsAt")}</dt><dd>{date(expiresAt, !isAccess)}</dd></div>
          ) : (
            <div><dt>{t("ban.length")}</dt><dd className="is-red">{t("ban.permanent")}</dd></div>
          )}
        </dl>
        {!isAccess && ban.message ? (
          <div className="ban-note">
            <small>{t("ban.noteLabel")}</small>
            <p>{ban.message}</p>
          </div>
        ) : null}
        {appeal.status === "pending" ? <p className="ban-chip">{t("ban.appealPending")}</p> : null}
        {appeal.status === "rejected" ? <p className="ban-chip is-rejected">{t("ban.appealRejected")}</p> : null}
        {error ? <p className="ban-error" role="alert">{error}</p> : null}
        <div className="ban-acts">
          {canAppeal ? (
            <button type="button" className="ban-btn is-primary" onClick={() => { setView("appeal"); setError(""); }}>
              <MessageCircle size={16} aria-hidden="true" />
              {t("ban.appeal")}
            </button>
          ) : null}
          {isAccess || !ticket ? (
            <a className="ban-btn" href={`mailto:${SUPPORT_EMAIL}`}>
              <Mail size={16} aria-hidden="true" />
              {t("ban.contactSupport")}
            </a>
          ) : null}
          {!isAccess ? (
            state.live ? (
              <button type="button" className="ban-btn" onClick={onClose}>{t("ban.ok")}</button>
            ) : (
              <button type="button" className="ban-btn" onClick={onClose}>
                <LogOut size={16} aria-hidden="true" />
                {t("ban.otherAccount")}
              </button>
            )
          ) : null}
        </div>
        {!isAccess && !state.live ? (
          <div className="ban-links">
            <a href={guidelinesUrl} target="_blank" rel="noopener noreferrer">{t("ban.guidelines")}</a>
            {ticket ? (
              <>
                <button type="button" onClick={downloadData} disabled={busy}>
                  <Download size={13} aria-hidden="true" />
                  {t("ban.downloadData")}
                </button>
                <button type="button" onClick={() => { setView("delete"); setError(""); }} disabled={busy}>{t("ban.deleteAccount")}</button>
              </>
            ) : null}
          </div>
        ) : null}
        {isAccess ? (
          <p className="ban-fine">
            {t("ban.accessFine")}
            {access.code ? ` ${t("ban.accessCode", { code: access.code })}` : ""}
          </p>
        ) : !expiresAt && !state.live && canAppeal ? (
          <p className="ban-fine">{appeal.emailOnFile === false ? t("authx.ban.appealFineNoEmail") : t("ban.appealFine")}</p>
        ) : null}
      </>
    );
  }

  const card = (
    <div ref={cardRef} className={`ban-card${isAccess ? " is-access" : ""}${preview ? " is-preview" : ""}`} role={preview ? undefined : "alertdialog"} aria-modal={preview ? undefined : "true"} aria-labelledby={preview ? undefined : "ban-title"}>
      <span className={`ban-seal${isAccess ? " is-access" : ""}`} aria-hidden="true">
        <Seal size={30} />
      </span>
      {body}
    </div>
  );

  if (preview) return card;
  if (typeof document === "undefined") return null;
  return createPortal(<div className={`ban-screen${isAccess ? " is-access" : ""}`}>{card}</div>, document.body);
}
