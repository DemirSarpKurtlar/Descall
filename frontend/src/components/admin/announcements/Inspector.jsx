/**
 * Seçili duyuru (Draft A inspection panel): what people see (the member card),
 * the engagement funnel (audience, delivered, seen, read, button), seen share
 * per platform, seen count per language version, and the grouped actions.
 */
import { useLocale } from "../../../context/LocaleContext";
import AnnouncementCard from "../../announcements/AnnouncementCard.jsx";
import { LOCALES, LOCALE_CODE, fmtNumber, fmtPct, funnel, platformRates, timeLeft } from "./announcementsModel.js";
import { previewItem } from "./Previews.jsx";
import { Chip, Ic } from "./ui.jsx";

const STATUS_TONE = { live: "green", scheduled: "violet", draft: "gray", pending: "gold", ended: "gray", archived: "gray" };
const FUNNEL_BG = { audience: "rgba(255,255,255,.14)", delivered: "#4a5fd6", seen: "#587af5", read: "#7b93ff", clicked: "#34c77b" };

export function statusLabel(item, t, now = Date.now()) {
  if (item.status === "live") {
    const left = timeLeft(item.endsAt, now);
    if (!left) return t("annc.status.liveForever");
    if (left.days) return t("annc.status.liveDays", { d: left.days, h: left.hours });
    if (left.hours) return t("annc.status.liveHours", { h: left.hours, m: left.minutes });
    return t("annc.status.liveMinutes", { m: Math.max(1, left.minutes) });
  }
  if (item.status === "scheduled") {
    const left = timeLeft(item.startsAt, now);
    return left ? t("annc.status.scheduledIn", { d: left.days, h: left.hours, m: left.minutes }) : t("annc.col.scheduled");
  }
  return t(`annc.col.${item.status}`);
}

export default function Inspector({ item, onAction, me, testId = "an-inspector" }) {
  const { t, locale } = useLocale();
  if (!item) {
    return (
      <aside className="an-insp is-empty" data-testid={testId}>
        <Ic name="megaphone" size={22} />
        <p>{t("annc.insp.pick")}</p>
      </aside>
    );
  }
  const published = ["live", "ended", "archived"].includes(item.status);
  const card = previewItem(
    { ...item, sourceLang: item.sourceLang, translations: item.translations },
    item.sourceLang || "tr",
    { author: item.author || "admin", createdAt: item.publishedAt || item.createdAt }
  );
  const rows = funnel(item);
  const plats = platformRates(item);
  const self = String(item.requestedBy || item.createdBy || "") === String(me?.id || "");
  return (
    <aside className="an-insp" data-testid={testId}>
      <div className="an-insp-hd">
        <span className="an-cap">{t("annc.insp.selected")}</span>
        <Chip tone={STATUS_TONE[item.status] || "gray"}>{statusLabel(item, t)}</Chip>
      </div>
      <span className="an-cap">{t("annc.insp.userSees")}</span>
      <AnnouncementCard item={card} preview />
      {published ? (
        <>
          <div>
            <span className="an-cap">{t("annc.insp.funnel")}</span>
            <div className="an-fun">
              {rows.map((r) => (
                <div key={r.id} className="an-fr">
                  <span>{t(`annc.funnel.${r.id}`)}</span>
                  <div className="an-bb">
                    <i style={{ width: `${Math.max(r.pct, r.value ? 3 : 0)}%`, background: FUNNEL_BG[r.id] }} />
                  </div>
                  <b className="tnum">{fmtNumber(r.value, locale)}</b>
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="an-cap">{t("annc.insp.byPlatform")}</span>
            <div className="an-plat">
              {plats.map((p) => (
                <div key={p.id}>
                  <b className="tnum">{p.rate == null ? "—" : fmtPct(p.rate, locale)}</b>
                  <span>{t(`annc.platform.${p.id}`)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="an-cap">{t("annc.insp.byLang")}</span>
            <div className="an-langs">
              {LOCALES.map((l) => (
                <span key={l} className={item.langStates?.[l] === "missing" ? "is-miss" : ""} title={t(`annc.lstate.${item.langStates?.[l] || "missing"}`)}>
                  {LOCALE_CODE[l]}
                  <em className="tnum">{item.langStates?.[l] === "missing" ? "—" : fmtNumber(item.stats?.langs?.[l] || 0, locale)}</em>
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div>
          <span className="an-cap">{t("annc.insp.langs")}</span>
          <div className="an-langs">
            {LOCALES.map((l) => (
              <span key={l} className={item.langStates?.[l] === "missing" ? "is-miss" : item.langStates?.[l] === "auto" || item.langStates?.[l] === "stale" ? "is-auto" : ""}>
                {LOCALE_CODE[l]}
                <em>{t(`annc.lstate.${item.langStates?.[l] || "missing"}`)}</em>
              </span>
            ))}
          </div>
        </div>
      )}
      {item.status === "pending" ? (
        <div className="an-note is-gold">
          <small>{t("annc.appr.ruleTitle")}</small>
          {self && !me?.owner ? t("annc.insp.waitingOther") : t("annc.insp.waitingYou")}
        </div>
      ) : null}
      <div className="an-insp-acts">
        {item.status === "pending" ? (
          <button type="button" className="an-btn is-green" onClick={() => onAction("approve", item)} disabled={self && !me?.owner}>
            <Ic name="shield" size={16} />
            {t("annc.appr.review")}
          </button>
        ) : null}
        {item.status === "draft" ? (
          <button type="button" className="an-btn is-primary" onClick={() => onAction("publish", item)}>
            <Ic name="send" size={16} />
            {item.needsApproval ? t("annc.composer.sendApproval") : t("annc.composer.publishNow")}
          </button>
        ) : null}
        {item.status !== "archived" ? (
          <button type="button" className="an-btn" onClick={() => onAction("edit", item)}>
            <Ic name="note" size={16} />
            {t("annc.act.edit")}
          </button>
        ) : (
          <button type="button" className="an-btn" onClick={() => onAction("unarchive", item)}>
            <Ic name="undo" size={16} />
            {t("annc.act.unarchive")}
          </button>
        )}
        <button type="button" className="an-btn" onClick={() => onAction("history", item)}>
          <Ic name="history" size={16} />
          {t("annc.act.historyN", { n: Math.max(1, item.version || 1) })}
        </button>
        <button type="button" className="an-btn" onClick={() => onAction("duplicate", item)}>
          <Ic name="copy" size={16} />
          {t("annc.act.copy")}
        </button>
      </div>
    </aside>
  );
}
