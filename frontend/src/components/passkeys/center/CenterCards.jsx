/**
 * The cards under the list (draft A): "Yedek önerisi" (a second passkey on another platform),
 * "Güvenlik e-postası" (what the security mail looks like, with its Ben değildim button) and
 * "Olağan dışı kullanım" (a passkey used from a new place: Bendim / remove and end sessions).
 */
import { AlertTriangle, ChevronRight, Mail, Monitor, Plus, QrCode, Shield, Usb } from "../../ui/Icon.jsx";
import { useT, useLocale } from "../../../context/LocaleContext";
import { passkeyKind } from "../../../lib/passkeys/visual.js";
import { KindTile } from "./bits.jsx";
import { placeName, shortWhen, fullDate, timeText } from "./centerFormat.js";

const OPTION_ICON = { remoteDevice: QrCode, securityKey: Usb, computer: Monitor };

export function BackupCard({ advice, disabled, onAdd }) {
  const t = useT();
  if (!advice) return null;
  return (
    <div className="pkc-pcard">
      <div className="pkc-cap">
        <Shield size={13} /> {t("passkey.center.backup.cap")}
      </div>
      <div className="pkc-pbody solid">
        <b className="pkc-small-title">{t("passkey.center.backup.title")}</b>
        <p className="pkc-small muted">{t("passkey.center.backup.lead")}</p>
        <div className="pkc-opts">
          {advice.options.map((o) => {
            const G = OPTION_ICON[o] || Plus;
            const tile = o === "remoteDevice" ? "t-ios" : o === "securityKey" ? "t-key" : "t-win";
            const content = (
              <>
                <span className={`pkc-tile ${tile}`} style={{ width: 26, height: 26, borderRadius: 8 }} aria-hidden="true">
                  <G size={14} />
                </span>
                <span className="txt">
                  {t(`passkey.center.backup.${o}`)}
                  <span>{t(`passkey.center.backup.${o}Sub`)}</span>
                </span>
                {o === "computer" ? null : <ChevronRight size={14} className="chev" />}
              </>
            );
            return o === "computer" ? (
              <div key={o} className="pkc-opt static">
                {content}
              </div>
            ) : (
              <button key={o} type="button" className="pkc-opt" disabled={disabled} onClick={() => onAdd?.(o)}>
                {content}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function EmailCard({ passkey, emailOn }) {
  const t = useT();
  const { locale } = useLocale();
  const name = passkey?.name || t("passkey.center.names.home");
  const when = passkey?.createdAt ? `${fullDate(passkey.createdAt, locale)} ${timeText(passkey.createdAt, locale)}` : "";
  const place = placeName(passkey?.createdCity, passkey?.createdCountry, locale) || t("passkey.center.email.somewhere");
  return (
    <div className="pkc-pcard">
      <div className="pkc-cap">
        <Mail size={13} /> {t("passkey.center.email.cap")}
      </div>
      <div className="pkc-mail" aria-label={t("passkey.center.email.cap")}>
        <div className="pkc-row">
          <span className="pkc-mail-logo" aria-hidden="true" />
          <b>Descall</b>
          <span className="push pkc-mail-time">{t("passkey.time.now")}</span>
        </div>
        <b className="pkc-mail-title">{t("passkey.center.email.title")}</b>
        <p>{t("passkey.center.email.body", { name, provider: passkey?.provider ? ` (${passkey.provider})` : "", when, place })}</p>
        <div className="pkc-row">
          <span className="pkc-mail-btn danger">{t("passkey.center.email.notMe")}</span>
          <span className="pkc-mail-btn">{t("passkey.center.email.itWasMe")}</span>
        </div>
      </div>
      <p className="pkc-small muted pkc-card-note">{emailOn ? t("passkey.center.email.lead") : t("passkey.center.email.noEmail")}</p>
    </div>
  );
}

export function AlertCard({ alert, passkey, busy, offline, geo, onResolve }) {
  const t = useT();
  const { locale } = useLocale();
  if (!alert) {
    return (
      <div className="pkc-pcard">
        <div className="pkc-cap">
          <AlertTriangle size={13} /> {t("passkey.center.alert.cap")}
        </div>
        <div className="pkc-pbody solid">
          <b className="pkc-small-title">{t("passkey.center.alert.noneTitle")}</b>
          <p className="pkc-small muted">{t("passkey.center.alert.noneLead")}</p>
          {geo === "country" ? <p className="pkc-small muted">{t("passkey.center.alert.countryOnly")}</p> : null}
        </div>
      </div>
    );
  }
  const kind = passkeyKind(passkey || {});
  const place = placeName(alert.city, alert.country, locale) || t("passkey.center.drawer.placeUnknown");
  const prev = (alert.previous || []).map((p) => placeName(p.city, p.country, locale)).filter(Boolean);
  return (
    <div className="pkc-pcard" id="pkc-alert">
      <div className="pkc-cap">
        <AlertTriangle size={13} /> {t("passkey.center.alert.cap")}
      </div>
      <div className="pkc-pbody solid">
        <div className="pkc-row top">
          <KindTile kind={kind} size={32} />
          <div className="grow min0">
            <b className="pkc-small-title">{t(alert.city ? "passkey.center.alert.titleCity" : "passkey.center.alert.titleCountry", { name: alert.name || "Passkey" })}</b>
            <div className="pkc-small muted">{[place, `${fullDate(alert.at, locale)} ${timeText(alert.at, locale)}`, alert.device].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <ol className="pkc-tl">
          <li className="ev">
            <span className="dot y" aria-hidden="true" />
            <div>
              {t("passkey.center.alert.signin", { place })}
              <span>{prev.length ? t("passkey.center.alert.before", { places: prev.join(", ") }) : t("passkey.center.alert.firstFar")}</span>
            </div>
            <em>{shortWhen(alert.at, t, locale)}</em>
          </li>
          {prev[0] ? (
            <li className="ev">
              <span className="dot" aria-hidden="true" />
              <div>
                {t("passkey.center.alert.signin", { place: prev[0] })}
                <span>{t("passkey.center.alert.usual")}</span>
              </div>
              <em />
            </li>
          ) : null}
        </ol>
        <div className="pkc-row">
          <button type="button" className="pkc-btn sm grow" disabled={busy || offline} onClick={() => onResolve?.(alert, "me")}>
            {t("passkey.center.alert.me")}
          </button>
          <button type="button" className="pkc-btn sm danger grow" disabled={busy || offline} onClick={() => onResolve?.(alert, "revoke")}>
            {t("passkey.center.alert.revoke")}
          </button>
        </div>
      </div>
    </div>
  );
}
