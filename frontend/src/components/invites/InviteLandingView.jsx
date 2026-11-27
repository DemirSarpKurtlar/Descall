/**
 * The invite page a friend sees at descall.com/r/<username> (owner pick 4A, section 2):
 * the inviter (live state only when their privacy allows it), the three gifts and a short
 * sign-up card with the condition written up front. Also the "Davetli sayfasını önizle"
 * preview inside Davet Merkezi (`preview`: nothing is clickable).
 */
import { useState } from "react";
import { useLocale } from "../../context/localeContextInstance.js";
import { nameVars } from "../../lib/trCase.js";
import { Avatar } from "../ui/Avatar";
import { Coin, Ico, PAvatar } from "./ui.jsx";
import { fmtNum } from "./format.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.7 7.1l6.3 5.3C37.4 38.3 44 33 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.97.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65ZM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.1 1.76-.96 2.8 1.01.08 2.05-.52 2.68-1.28Z" />
    </svg>
  );
}

export default function InviteLandingView({ data, preview = false, phone = false, busy = false, onGoogle, onApple, onEmail, onLogin, appleAvailable = true }) {
  const { t, locale } = useLocale();
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const inv = data?.inviter || {};
  const name = inv.displayName || inv.username || "";
  const nv = nameVars(name, locale);
  const gift = data?.gifts?.inviteeReward || 0;
  const giftInviter = data?.gifts?.inviterReward || 0;
  const act = inv.activity;
  const off = preview ? { tabIndex: -1, "aria-hidden": undefined } : {};

  const submitEmail = (e) => {
    e.preventDefault();
    if (preview) return;
    const v = email.trim();
    if (!EMAIL_RE.test(v)) {
      setEmailErr(t("dvt.land.emailBad"));
      return;
    }
    setEmailErr("");
    onEmail?.(v);
  };

  const hero = (
    <div className="dvt-land-hero">
      <div className="dvt-row" style={{ gap: 16, alignItems: "center" }}>
        <span className="dvt-land-av">
          <Avatar name={name} size={phone ? 56 : 64} user={{ username: inv.username, display_name: name, avatar_url: inv.avatarUrl }} imageUrl={inv.avatarUrl || undefined} frame={false} />
          {inv.online ? <i className="dvt-dot" /> : null}
        </span>
        <div className="dvt-col">
          <span className="dvt-pl br self-start">{t("dvt.land.personal")}</span>
          <h1>
            {t("dvt.land.titleA", { name })}
            <br />
            {t("dvt.land.titleB", { name })}
          </h1>
        </div>
      </div>
      <p className="dvt-land-tag">{t("dvt.land.tagline")}</p>
      {inv.online ? (
        <div className="dvt-gl dvt-row dvt-land-live">
          <span className="dvt-ib ok">
            <Ico name="vol" />
          </span>
          <div className="dvt-col sp">
            <b>{t("dvt.land.online", { name })}</b>
            <small className="mu">
              {act?.kind === "voice"
                ? act.serverName
                  ? t("dvt.land.inVoiceServer", { server: act.serverName, n: act.count })
                  : t("dvt.land.inVoice", { n: act.count })
                : t("dvt.land.onlineIdle")}
            </small>
          </div>
          {act?.people?.length ? (
            <div className="dvt-avs">
              {act.people.slice(0, 3).map((p, i) => (
                <PAvatar key={i} user={{ displayName: p.name, avatarUrl: p.avatarUrl }} size={22} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const gifts = (
    <div className="dvt-col dvt-land-gifts">
      <span className="dvt-cap">{t("dvt.land.waiting")}</span>
      {gift > 0 ? (
        <div className="dvt-row">
          <span className="dvt-ib gd">
            <Coin size="l" />
          </span>
          <div className="sp">
            <b>{t("dvt.land.gift1", { amount: fmtNum(gift, locale) })}</b>
            <small className="mu">{t("dvt.land.gift1Sub")}</small>
          </div>
        </div>
      ) : null}
      <div className="dvt-row">
        <span className="dvt-ib">
          <Ico name="shieldc" />
        </span>
        <div className="sp">
          <b>{t("dvt.land.gift2")}</b>
          <small className="mu">{t("dvt.land.gift2Sub", nv)}</small>
        </div>
      </div>
      <div className="dvt-row">
        <span className="dvt-ib tl">
          <Ico name="users" />
        </span>
        <div className="sp">
          <b>{t("dvt.land.gift3", nv)}</b>
          <small className="mu">{t("dvt.land.gift3Sub")}</small>
        </div>
      </div>
    </div>
  );

  const form = (
    <form className="dvt-opq dvt-col dvt-land-form" onSubmit={submitEmail} noValidate>
      <b className="dvt-land-ft">{t("dvt.land.formTitle")}</b>
      <span className="mu">{t("dvt.land.formSub")}</span>
      <button type="button" className="dvt-auth google" disabled={busy} onClick={() => !preview && onGoogle?.()} {...off}>
        <GoogleMark />
        {t("dvt.land.google")}
      </button>
      {appleAvailable ? (
        <button type="button" className="dvt-auth apple" disabled={busy} onClick={() => !preview && onApple?.()} {...off}>
          <AppleMark />
          {t("dvt.land.apple")}
        </button>
      ) : null}
      <div className="dvt-row dvt-or">
        <span className="sep sp" />
        {t("dvt.land.or")}
        <span className="sep sp" />
      </div>
      <label className={`dvt-fld big ${emailErr ? "bad" : ""}`.trim()}>
        <Ico name="mail" />
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t("dvt.land.emailPh")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(emailErr) || undefined}
          aria-label={t("dvt.land.emailPh")}
          readOnly={preview}
          {...off}
        />
      </label>
      {emailErr ? (
        <small className="dgt" role="alert">
          {emailErr}
        </small>
      ) : null}
      <button type="submit" className="dvt-btn p big" disabled={busy} {...off}>
        {t("dvt.land.emailCta")}
      </button>
      <div className="dvt-row dvt-land-tagline">
        <PAvatar user={{ displayName: name, avatarUrl: inv.avatarUrl }} size={18} />
        <span className="sp">
          {t("dvt.land.tag")} <b>@{inv.username}</b> · {t("dvt.land.tagSub")}
        </span>
      </div>
      <small className="mu dvt-land-terms">
        {data?.paused || !gift ? t("dvt.land.termsPaused") : t("dvt.land.terms", { name, amount: fmtNum(giftInviter, locale) })}
      </small>
    </form>
  );

  return (
    <div className={`dvt-land ${phone ? "is-phone" : "is-desk"} ${preview ? "is-preview" : ""}`.trim()} data-testid="dvt-landing">
      <div className="dvt-webnav">
        <img src="/brand/descall-icon-small.svg" alt="" className="dvt-logo" onError={(e) => (e.currentTarget.style.display = "none")} />
        <span className="dvt-wm">Descall</span>
        <span className="sp" />
        {preview ? <span className="dvt-pl br">{t("dvt.land.previewBadge")}</span> : null}
        <button type="button" className="dvt-btn sm" onClick={() => !preview && onLogin?.()} {...off}>
          {t("dvt.land.login")}
        </button>
      </div>
      {phone ? (
        <div className="dvt-col dvt-land-body">
          {hero}
          {form}
          {gifts}
        </div>
      ) : (
        <div className="dvt-land-grid">
          <div className="dvt-col" style={{ gap: 18 }}>
            {hero}
            {gifts}
          </div>
          {form}
        </div>
      )}
    </div>
  );
}
