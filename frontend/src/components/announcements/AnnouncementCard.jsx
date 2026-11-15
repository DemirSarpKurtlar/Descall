import { useState } from "react";
import { AnnGlyph, AnnTile } from "./AnnGlyph.jsx";
import { useLocale } from "../../context/LocaleContext";
import { formatDate } from "../../i18n/format";

const LANG_NAME_KEY = { tr: "tr", en: "en", de: "de", es: "es", fr: "fr", "pt-BR": "ptBR", ru: "ru" };

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]{1,80}\]\(https:\/\/[^)\s]{1,300}\))/g;

function inline(text, keyBase) {
  const out = [];
  let last = 0;
  let m;
  let i = 0;
  INLINE.lastIndex = 0;
  const s = String(text || "");
  while ((m = INLINE.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("[")) {
      const close = tok.indexOf("](");
      out.push(
        <a key={key} href={tok.slice(close + 2, -1)} target="_blank" rel="noopener noreferrer">
          {tok.slice(1, close)}
        </a>
      );
    } else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** Announcement text: **bold**, *italic*, [link](https://...) and "- " list lines; never HTML. */
export function RichText({ text }) {
  const lines = String(text || "").split("\n");
  const out = [];
  let list = [];
  const flush = (k) => {
    if (!list.length) return;
    out.push(
      <ul key={`ul-${k}`} className="ann-ul">
        {list.map((l, j) => (
          <li key={j}>{inline(l, `li-${k}-${j}`)}</li>
        ))}
      </ul>
    );
    list = [];
  };
  lines.forEach((line, k) => {
    const m = /^\s*[-•]\s+(.*)$/.exec(line);
    if (m) {
      list.push(m[1]);
      return;
    }
    flush(k);
    out.push(
      <span key={`l-${k}`} className="ann-line">
        {inline(line, `l-${k}`)}
        {k < lines.length - 1 ? "\n" : null}
      </span>
    );
  });
  flush("end");
  return out;
}

export function announcementWhen(iso, t, locale, now = Date.now()) {
  const then = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(then)) return "";
  const min = Math.max(0, Math.round((now - then) / 60000));
  if (min < 1) return t("annc.u.justNow");
  if (min < 60) return t("annc.u.minAgo", { n: min });
  const hr = Math.round(min / 60);
  if (hr < 24) return t("annc.u.hourAgo", { n: hr });
  const day = Math.round(hr / 24);
  if (day < 14) return t("annc.u.dayAgo", { n: day });
  return formatDate(iso, locale, { dateStyle: "medium" });
}

/** Text color that reads on a button filled with `hex`. */
export function ctaInk(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  if (!m) return "#fff";
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? "#14151c" : "#fff";
}

/**
 * One announcement as members see it (the window, the toast, and every admin preview).
 * Pinned and priority styling, cover image, CTA button, author and time, language fallback note.
 */
export default function AnnouncementCard({ item, onCta, compact = false, preview = false, expandable = true, now, className = "", cardRef }) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  if (!item) return null;
  const color = /^#[0-9a-f]{6}$/i.test(String(item.color || "")) ? item.color : "#587af5";
  const long = String(item.content || "").length > 220 || String(item.content || "").split("\n").length > 4;
  const clamp = expandable && long && !open;
  const prio = item.priority === "urgent" || item.priority === "important" ? item.priority : "normal";
  const when = announcementWhen(item.createdAt || item.created_at, t, locale, now);
  const hasCta = Boolean(item.ctaLabel && item.ctaUrl);
  return (
    <article
      ref={cardRef}
      data-ann-id={item.id || undefined}
      className={`ann-card is-${prio}${item.pinned ? " is-pinned" : ""}${compact ? " is-compact" : ""}${item.read === false && !preview ? " is-unread" : ""} ${className}`.trim()}
      style={{ "--ann-c": color }}
    >
      {item.coverUrl ? (
        <div className="ann-cover">
          <img src={item.coverUrl} alt="" loading="lazy" decoding="async" />
        </div>
      ) : null}
      <div className="ann-card-body">
        <div className="ann-card-head">
          <AnnTile item={item} color={color} size={compact ? "sm" : "md"} />
          <div className="ann-card-titles">
            <div className="ann-card-chips">
              {item.pinned ? (
                <span className="ann-chip is-pin">
                  <AnnGlyph name="pin" size={11} />
                  {t("annc.u.pinned")}
                </span>
              ) : null}
              {prio !== "normal" ? <span className={`ann-chip is-${prio}`}>{t(`annc.prio.${prio}`)}</span> : null}
              {item.read === false && !preview ? <span className="ann-new-dot" aria-label={t("annc.u.new")} /> : null}
            </div>
            <h4 className="ann-card-title">{item.title}</h4>
          </div>
        </div>
        <div className={`ann-card-text${clamp ? " is-clamped" : ""}`}>
          <RichText text={item.content} />
        </div>
        {expandable && long ? (
          <button type="button" className="ann-more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? t("annc.u.less") : t("annc.u.more")}
          </button>
        ) : null}
        {hasCta ? (
          <button
            type="button"
            className="ann-cta"
            style={{ background: color, color: ctaInk(color) }}
            onClick={(e) => {
              e.stopPropagation();
              onCta?.(item);
            }}
            tabIndex={preview ? -1 : undefined}
          >
            {item.ctaLabel}
            {/^https:/i.test(String(item.ctaUrl)) ? <AnnGlyph name="ext" size={13} /> : <AnnGlyph name="chevr" size={14} />}
          </button>
        ) : null}
        <div className="ann-card-meta">
          {item.author ? <span>@{item.author}</span> : null}
          {when ? <span>{when}</span> : null}
          {item.fallback && item.lang ? <span className="ann-fallback">{t("annc.u.shownIn", { lang: t(`annc.lang.${LANG_NAME_KEY[item.lang] || "en"}`) })}</span> : null}
        </div>
      </div>
    </article>
  );
}
