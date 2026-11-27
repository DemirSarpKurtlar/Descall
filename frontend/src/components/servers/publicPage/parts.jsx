/* Building blocks of the public page desk (UI-BRIEF draft A, "Sahip ayarları"). */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { I, Mark } from "./icons";
import { renderServerPage, pageMeta } from "../../../../public/server-page.js";
import { axis, linePoints, serpText, sourceShares, agoParts, auditFields } from "../../../lib/publicPage.js";
import { formatNumber } from "../../../i18n/format.js";
import { useModalFocusRef } from "../../../hooks/useModalFocus";

export const SOURCE_COLORS = {
  google: "#587AF5", bing: "#00A4EF", yandex: "#FC3F1D", duckduckgo: "#DE5833", whatsapp: "#25D366", telegram: "#2AABEE", x: "#8b98a5",
  instagram: "#E1306C", facebook: "#1877F2", reddit: "#FF4500", discord: "#5865F2", youtube: "#FF0033", tiktok: "#2AD4B8",
  descall: "#8FA6FF", qr: "#9B5DE5", direct: "#6B6F80", other: "#4A4E5E",
};

export function Seg({ value, options, onChange, label }) {
  return (
    <div className="ppd-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} className={value === o.v ? "on" : ""} onClick={() => onChange(o.v)}>
          {o.icon ? <I n={o.icon} s={13} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled, large }) {
  return (
    <button type="button" role="switch" aria-checked={Boolean(on)} aria-label={label} disabled={disabled} className={`ppd-tog${large ? " lgt" : ""}${on ? " on" : ""}`} onClick={() => onChange(!on)} />
  );
}

/** Google result mock: title, URL crumb, description (bold query words), event date rows. */
export function Serp({ page, lang, theme, query, t, counts }) {
  const meta = useMemo(() => (page ? pageMeta(page, lang) : { title: "", description: "" }), [page, lang]);
  if (!page) return null;
  const title = serpText(meta.title, 60);
  const words = String(query || "")
    .toLocaleLowerCase(lang)
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const bold = (text) => {
    if (!words.length) return text;
    const parts = String(text).split(/(\s+)/);
    return parts.map((p, i) => (words.includes(p.toLocaleLowerCase(lang).replace(/[.,;:!?]/g, "")) ? <em key={i}>{p}</em> : p));
  };
  const countText = counts && page.counts ? `${t("pubpage.memberCount", { n: formatNumber(page.counts.members, lang) })}, ${formatNumber(page.counts.online, lang)} ${t("pubpage.serp.online").toLocaleLowerCase(lang)}. ` : "";
  const desc = serpText(meta.description, 155 - countText.length);
  const evs = (page.events || []).slice(0, 2);
  return (
    <div className={`ppd-serp${theme === "l" ? " l" : ""}`} data-testid="ppd-serp">
      <div className="q"><I n="search" s={16} /> {query || page.name}</div>
      <div className="src">
        <div className="fav"><svg width="18" height="18" viewBox="0 0 100 100" aria-hidden="true"><path fill="#587AF5" d="M67.58 62.5A27.25 27.25 0 1 1 37.5 32.42A5.75 5.75 0 0 1 38.76 43.85A15.75 15.75 0 1 0 56.15 61.24A5.75 5.75 0 0 1 67.58 62.5ZM32.42 37.5A27.25 27.25 0 1 1 62.5 67.58A5.75 5.75 0 0 1 61.24 56.15A15.75 15.75 0 1 0 43.85 38.76A5.75 5.75 0 0 1 32.42 37.5ZM44.25 50a5.75 5.75 0 1 0 11.5 0a5.75 5.75 0 1 0 -11.5 0Z" /></svg></div>
        <div><b>Descall</b><small>https://descall.com › s › {page.slug}</small></div>
      </div>
      <div className="tt" data-testid="ppd-serp-title">{title.text}</div>
      <div className="ds">{countText}{bold(desc.text)}</div>
      {evs.length ? (
        <div className="ev">
          {evs.map((e) => {
            let when = "";
            try {
              when = new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short" }).format(new Date(e.startsAt));
            } catch {
              when = "";
            }
            return [<span key={`${e.id}t`}>{e.title}</span>, <span key={`${e.id}d`}>{when}</span>, <span key={`${e.id}p`}>{t("pubpage.serp.online")}</span>];
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The real public page HTML (public/server-page.js) in a sandboxed iframe: scripts off,
 * links inert. Desktop is drawn 1100px wide and scaled to fit; phone is 390px in a frame.
 */
export function PagePreview({ page, lang, mode, theme, label }) {
  const html = useMemo(() => {
    if (!page) return "";
    const doc = renderServerPage(page, { lang, preview: true });
    return theme === "light" ? doc.replace("<html ", '<html data-theme="light" ') : doc.replace("<html ", '<html data-theme="dark" ');
  }, [page, lang, theme]);
  const wrap = useRef(null);
  const frame = useRef(null);
  const [scale, setScale] = useState(0.5);
  const [docH, setDocH] = useState(1200);
  useLayoutEffect(() => {
    if (mode !== "d" || !wrap.current) return undefined;
    const el = wrap.current;
    const fit = () => setScale(Math.max(0.2, (el.clientWidth || 600) / 1100));
    fit();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);
  const measure = () => {
    try {
      const h = frame.current?.contentDocument?.documentElement?.scrollHeight;
      if (h) setDocH(h);
    } catch {
      /* not readable: keep the default */
    }
  };
  useEffect(() => {
    const id = setTimeout(measure, 200);
    return () => clearTimeout(id);
  }, [html, mode]);
  if (!page) return null;
  if (mode === "p") {
    return (
      <div className="ppd-pvwrap ppd-pvphone">
        <div className="ppd-phone">
          <div className="isl" />
          <div className="scr">
            <iframe title={label} srcDoc={html} sandbox="allow-same-origin" width="390" height="760" loading="lazy" data-testid="ppd-preview-phone" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="ppd-pvwrap" ref={wrap}>
      <div style={{ height: docH * scale, position: "relative" }}>
        <iframe
          ref={frame}
          title={label}
          srcDoc={html}
          sandbox="allow-same-origin"
          onLoad={measure}
          data-testid="ppd-preview-desktop"
          style={{ width: 1100, height: docH, transform: `scale(${scale})`, transformOrigin: "0 0", position: "absolute", left: 0, top: 0, border: 0 }}
        />
      </div>
    </div>
  );
}

export function AreaChart({ series, lang, t }) {
  const w = 290;
  const h = 130;
  const views = series.map((s) => s.views);
  const google = series.map((s) => s.google);
  const { top, ticks } = axis(Math.max(...views, ...google, 1));
  const a = linePoints(views, { w, h, top });
  const b = linePoints(google, { w, h, top });
  if (!a.length) return null;
  const poly = (pts) => pts.map((p) => p.join(",")).join(" ");
  const base = h - 22;
  const fmt = (d) => {
    try {
      return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00Z`));
    } catch {
      return d;
    }
  };
  const xl = [0, Math.floor((series.length - 1) / 2), series.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="ppd-chart" role="img" aria-label={`${t("pubpage.results.legendViews")}, ${t("pubpage.results.legendGoogle")}`}>
      <defs>
        <linearGradient id="ppdA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8FA6FF" stopOpacity=".32" /><stop offset="1" stopColor="#8FA6FF" stopOpacity="0" /></linearGradient>
      </defs>
      {ticks.map((v) => {
        const y = h - 22 - (v / top) * (h - 34);
        return (
          <g key={v}>
            <line x1="34" x2={w - 10} y1={y} y2={y} className="grid" />
            <text x="28" y={y + 4} textAnchor="end" className="lbl">{formatNumber(v, lang)}</text>
          </g>
        );
      })}
      {xl.map((i) => (
        <text key={i} x={a[i][0]} y={h - 6} textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} className="lbl">{fmt(series[i].day)}</text>
      ))}
      <polygon points={`${a[0][0]},${base} ${poly(a)} ${a[a.length - 1][0]},${base}`} fill="url(#ppdA)" />
      <polyline points={poly(a)} fill="none" stroke="#8FA6FF" strokeWidth="2" strokeLinejoin="round" />
      <polyline points={poly(b)} fill="none" stroke="#2AD4B8" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function SourceBar({ sources, field, t }) {
  const { parts } = sourceShares(sources, field);
  if (!parts.length) return <div className="ppd-note">{t("pubpage.results.sourcesNone")}</div>;
  return (
    <>
      <div className="ppd-srcbar">
        {parts.map((p) => <i key={p.source} style={{ width: `${p.pct}%`, background: SOURCE_COLORS[p.source] || SOURCE_COLORS.other }} />)}
      </div>
      <div className="ppd-legend">
        {parts.map((p) => (
          <span key={p.source}><i style={{ background: SOURCE_COLORS[p.source] || SOURCE_COLORS.other }} />{t(`pubpage.results.src.${p.source}`)} {p.pct}%</span>
        ))}
      </div>
    </>
  );
}

function initials(name) {
  const ch = Array.from(String(name || "").replace(/[^\p{L}\p{N}]/gu, ""))[0];
  return ch ? ch.toLocaleUpperCase() : "?";
}

export function Avatar({ name, url, s = 24 }) {
  if (url) return <img className="ppd-av" src={url} alt="" width={s} height={s} style={{ width: s, height: s }} />;
  let h = 0;
  for (const c of String(name || "")) h = (h * 31 + c.codePointAt(0)) >>> 0;
  const colors = ["#E1780F", "#E8457A", "#19A2B3", "#9B5DE5", "#2DAA53", "#3E7BFA", "#BB8E0A", "#5E5CE6"];
  return <span className="ppd-av" style={{ width: s, height: s, background: colors[h % colors.length], fontSize: Math.round(s * 0.42) }}>{initials(name)}</span>;
}

export function AuditList({ entries, lang, t }) {
  if (!entries?.length) return <div className="ppd-note">{t("pubpage.audit.empty")}</div>;
  return (
    <div className="ppd-lst ppd-audit">
      {entries.map((e) => {
        const ago = agoParts(e.createdAt);
        const when = ago ? t(`pubpage.ago.${ago.key}`, { n: ago.n }) : "";
        const fields = auditFields(e.changes).map((k) => t(`pubpage.audit.fields.${k}`));
        const reasonKey = e.changes?.reason || (e.reason ? String(e.reason).split(":")[0] : "");
        const reason = e.action === "PUBLIC_PAGE_DISABLE" && reasonKey ? t(`pubpage.disable.reasons.${reasonKey}`) : "";
        let detail = "";
        if (reason) detail = t("pubpage.audit.reason", { r: reason });
        else if (fields.length) detail = t("pubpage.audit.changed", { fields: fields.join(", ") });
        let date = "";
        try {
          date = ago && ago.key === "day" && ago.n > 6 ? new Intl.DateTimeFormat(lang, { day: "numeric", month: "long" }).format(new Date(e.createdAt)) : when;
        } catch {
          date = when;
        }
        return (
          <div className="it" key={e.id}>
            <Avatar name={e.actor?.name || "?"} url={e.actor?.avatarUrl} s={24} />
            <div className="gr">
              <b>{e.actor?.name || "?"}</b> {t(`pubpage.audit.${e.action}`)}
              <br />
              <small>{[detail, date].filter(Boolean).join(" · ")}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DisableDialog({ busy, onCancel, onConfirm, t, reasons }) {
  const [reason, setReason] = useState(reasons[0]);
  const [note, setNote] = useState("");
  const trap = useModalFocusRef();
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);
  const needNote = reason === "other" && !note.trim();
  return (
    <div className="ppd-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="ppd-dlg" role="alertdialog" aria-modal="true" aria-labelledby="ppd-dlg-t" aria-describedby="ppd-dlg-b" ref={trap} data-testid="ppd-disable-dialog">
        <h5 id="ppd-dlg-t">{t("pubpage.disable.title")}</h5>
        <p id="ppd-dlg-b">{t("pubpage.disable.body")}</p>
        <div className="lbl">{t("pubpage.disable.reasonLabel")}</div>
        <div role="radiogroup" aria-label={t("pubpage.disable.reasonLabel")}>
          {reasons.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={reason === r} className={`ppd-radio${reason === r ? " on" : ""}`} onClick={() => setReason(r)}>
              <i />{t(`pubpage.disable.reasons.${r}`)}
            </button>
          ))}
        </div>
        {reason === "other" ? (
          <input className="ppd-inp" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t("pubpage.disable.notePh")} aria-label={t("pubpage.disable.notePh")} autoFocus />
        ) : null}
        <div className="ppd-dlg-actions">
          <button type="button" className="ppd-btn" onClick={onCancel} disabled={busy}>{t("pubpage.disable.cancel")}</button>
          <button type="button" className="ppd-btn dan solid" disabled={busy || needNote} onClick={() => onConfirm({ reason, note: note.trim() })} data-testid="ppd-disable-confirm">
            {t("pubpage.disable.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SnavItem({ tile, icon, label, on, onClick }) {
  return (
    <button type="button" className={on ? "on" : ""} aria-current={on ? "page" : undefined} onClick={onClick}>
      <span className={`tile c-${tile}`}><I n={icon} s={13} /></span>
      {label}
    </button>
  );
}

export { Mark };
