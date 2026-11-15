/**
 * "Kullanıcının göreceği" previews: the desktop app window (pinned banner +
 * live toast), the iPhone sheet with the real announcement card, and the phone
 * notification. They render the member components, so what the admin sees is
 * what people get.
 */
import { useLocale } from "../../../context/LocaleContext";
import AnnouncementCard, { ctaInk } from "../../announcements/AnnouncementCard.jsx";
import { AnnGlyph, AnnTile } from "../../announcements/AnnGlyph.jsx";
import { localizedText } from "./announcementsModel.js";

/** Draft -> what one person in `lang` gets (the member card's shape). */
export function previewItem(draft, lang, { author = "admin", createdAt = null } = {}) {
  const text = localizedText(draft, lang);
  return {
    id: draft.id || "preview",
    title: text.title,
    content: text.content,
    ctaLabel: draft.ctaUrl ? text.ctaLabel : "",
    ctaUrl: draft.ctaUrl || "",
    coverUrl: draft.coverUrl || "",
    icon: draft.icon,
    color: draft.color,
    priority: draft.priority,
    pinned: draft.pinned,
    author,
    createdAt: createdAt || new Date(Date.now() - 2 * 3600000).toISOString(),
    lang: text.lang,
    fallback: text.fallback,
  };
}

export function DesktopPreview({ item, height = 296 }) {
  const { t } = useLocale();
  const color = item.color || "#587af5";
  return (
    <div className="an-win" style={{ height }} aria-label={t("annc.preview.desktop")}>
      <div className="an-win-bar">
        <i />
        <i />
        <i />
        <span>Descall</span>
      </div>
      <div className="an-win-app">
        <div className="an-win-servers">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>
        <div className="an-win-chans">{[70, 55, 80, 45, 65, 50, 75, 40].map((w, i) => <i key={i} style={{ width: `${w}%` }} />)}</div>
        <div className="an-win-main">
          {item.pinned ? (
            <div className="an-win-banner" style={{ "--ann-c": color }}>
              <AnnGlyph name={item.icon} size={13} />
              <span className="an-ell">{item.title || t("annc.composer.untitled")}</span>
              {item.ctaLabel ? <u>{item.ctaLabel}</u> : null}
            </div>
          ) : null}
          {[60, 40, 72, 35, 55].map((w, i) => (
            <div key={i} className="an-win-msg">
              <i />
              <u style={{ width: `${w}%` }} />
            </div>
          ))}
          <div className="an-win-toast" style={{ "--ann-c": color }}>
            <AnnTile item={item} color={color} size="sm" />
            <div>
              <b>{t("annc.u.newKicker")}</b>
              <p className="an-ell">{item.title || t("annc.composer.untitled")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PhonePreview({ item, others = [], caption }) {
  const { t } = useLocale();
  return (
    <figure className="an-phone-wrap">
      <div className="an-phone" aria-label={t("annc.preview.phone")}>
        <div className="an-phone-scr">
          <div className="an-phone-isl" />
          <div className="an-phone-sb">
            <span>14:20</span>
            <span>5G</span>
          </div>
          <div className="an-phone-bg">
            {[80, 60, 70, 50].map((w, i) => (
              <div key={i}>
                <i />
                <u style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
          <div className="an-phone-sheet">
            <div className="an-phone-hd" />
            <h4>
              <AnnGlyph name="megaphone" size={14} />
              {t("annc.u.title")}
            </h4>
            <div className="an-phone-list">
              <AnnouncementCard item={item} compact preview expandable={false} />
              {others.slice(0, 1).map((o) => (
                <div key={o.id} className="an-phone-other">
                  <AnnTile item={o} size="sm" />
                  <b>{o.title}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export function PushPreview({ title }) {
  const { t } = useLocale();
  return (
    <div className="an-push">
      <span className="an-push-ap" aria-hidden="true">
        <AnnGlyph name="megaphone" size={15} />
      </span>
      <div className="an-push-body">
        <div className="an-push-top">
          <b>Descall</b>
          <time>{t("annc.preview.now")}</time>
        </div>
        <p>{title || t("annc.composer.untitled")}</p>
      </div>
    </div>
  );
}

export { ctaInk };
