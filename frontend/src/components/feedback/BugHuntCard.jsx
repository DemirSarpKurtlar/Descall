/*
 * Bug Avcısı card in the sender's feedback thread ({ type: "bughunt" } lines,
 * backend lib/bugHunter/model.js threadEntry): "Bildirdiğin hata gerçek bir bugmış, düzelttik.
 * Bug Hunter rozetini kazandın." with the badge art and its level, the DesCoin bonus, and the
 * later "Düzeltildi" follow-up. Server text arrives in English with i18n refs.
 */
import { localizedField } from "../../i18n/serverText.js";
import { useLocale } from "../../context/LocaleContext";
import { SpecialBadgeIcon } from "../badges/specialBadgeArt.jsx";
import "../../styles/bug-hunter.css";

const SEV = { low: "bhunt.sevLow", medium: "bhunt.sevMedium", high: "bhunt.sevHigh", critical: "bhunt.sevCritical" };

function FixedMark() {
  return (
    <svg className="bhc-fixed" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <defs>
        <linearGradient id="bhc-fx" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5ef0a8" />
          <stop offset="1" stopColor="#16a36a" />
        </linearGradient>
      </defs>
      <circle cx="22" cy="22" r="19" fill="url(#bhc-fx)" opacity=".18" />
      <circle cx="22" cy="22" r="15" fill="none" stroke="url(#bhc-fx)" strokeWidth="2.4" />
      <path d="M15.4 22.6l4.4 4.4 8.8-9.4" fill="none" stroke="url(#bhc-fx)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function BugHuntCard({ m, t, time = "" }) {
  const { locale } = useLocale();
  if (!m || m.type !== "bughunt") return null;
  const L = (prop) => localizedField(m, prop, locale);
  const kind = m.event === "fixed" ? "fixed" : m.event === "also" ? "also" : "confirmed";
  const head = t(kind === "fixed" ? "bhunt.cardFixed" : kind === "also" ? "bhunt.cardAlso" : "bhunt.cardConfirmed");
  const sev = m.severity && SEV[m.severity] ? t("bhunt.cardSeverity", { severity: t(SEV[m.severity]) }) : null;
  const art = kind === "fixed" ? <FixedMark /> : <SpecialBadgeIcon id="bughunter" size={46} level={m.badgeId ? m.level || 1 : 0} label="" />;
  return (
    <div className={`bhc is-${kind}${m.severity === "critical" ? " is-critical" : ""}`} role="group" aria-label={head}>
      <div className="bhc-art" aria-hidden="true">{art}</div>
      <div className="bhc-t">
        <span className="bhc-k">
          <span>{head}</span>
          {sev ? <span className={`bhc-sev s-${m.severity}`}>{sev}</span> : null}
          {time ? <time>{time}</time> : null}
        </span>
        <b className="bhc-main">{L("text")}</b>
        {m.badgeLine ? <span className="bhc-line">{L("badgeLine")}</span> : null}
        {m.glitchLine ? (
          <span className="bhc-line is-glitch"><SpecialBadgeIcon id="glitch" size={16} label="" />{L("glitchLine")}</span>
        ) : null}
        {m.rewardLine ? <span className="bhc-coin">{L("rewardLine")}</span> : null}
      </div>
    </div>
  );
}
