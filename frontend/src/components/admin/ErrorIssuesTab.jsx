/**
 * Yönetici Paneli › Hata Kayıtları (3.7.0, rewritten). Errors from every
 * platform grouped into issues (backend/lib/errorGroups.js): how often, how
 * many people, which platforms, a trend, and a decision per issue (open,
 * resolved, ignored; a resolved issue that comes back is marked "Tekrar etti").
 * Server: routes/adminErrors.js.
 */
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../../api/adminHttp";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDateTime } from "../../lib/datetime";
import { AlertTriangle, Bug, Check, Copy, RefreshCw, Search, X, Users, EyeOff, RotateCcw } from "../ui/Icon.jsx";
import OverlayPortal from "../ui/OverlayPortal.jsx";
import "../../styles/admin-errors.css";

const RANGES = ["24h", "7d", "30d"];
const STATUSES = ["open", "resolved", "ignored", "all"];
const PLATFORMS = ["windows-app", "iphone-app", "ipad-app", "android-app", "iphone-web", "android-web", "desktop-web", "server", "other"];

/** Relative "3 dk önce" style, pure (tested). */
export function ago(iso, t, now = Date.now()) {
  const ms = now - Date.parse(iso || 0);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const m = Math.round(ms / 60000);
  if (m < 1) return t("admin.errJustNow");
  if (m < 60) return t("admin.errMinAgo", { n: m });
  const h = Math.round(m / 60);
  if (h < 48) return t("admin.errHourAgo", { n: h });
  return t("admin.errDayAgo", { n: Math.round(h / 24) });
}

function Spark({ data }) {
  const max = Math.max(1, ...data);
  const w = 96;
  const h = 26;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg className="aer-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function PlatformChips({ platforms, t }) {
  const list = Object.entries(platforms || {}).sort((a, b) => b[1] - a[1]);
  return (
    <span className="aer-plats">
      {list.slice(0, 3).map(([p, n]) => (
        <span key={p} className="aer-chip">
          {t(`admin.errPlat_${p}`)} <b>{n}</b>
        </span>
      ))}
      {list.length > 3 ? <span className="aer-chip">+{list.length - 3}</span> : null}
    </span>
  );
}

function Detail({ fp, t, locale, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    adminFetch(`/error-groups/${fp}`)
      .then((d) => {
        setData(d);
        setNote(d?.group?.note || "");
      })
      .catch((e) => setErr(e?.message || t("admin.errLoadFailed")));
  }, [fp, t]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setStatus = async (status) => {
    setBusy(true);
    setErr("");
    try {
      await adminFetch(`/error-groups/${fp}/status`, { method: "POST", body: JSON.stringify({ status, note }) });
      onChanged();
      onClose();
    } catch (e) {
      setErr(e?.message || t("admin.errSaveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const g = data?.group;
  const ev = data?.events?.[0];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${ev?.message || ""}\n\n${ev?.stack || ""}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <OverlayPortal>
      <div className="aer-scrim" onClick={onClose} role="presentation">
        <aside className="aer-drawer" role="dialog" aria-modal="true" aria-label={t("admin.errDetail")} onClick={(e) => e.stopPropagation()}>
          <header className="aer-dhead">
            <span className={`aer-dot is-${g?.status || "open"}`} aria-hidden="true" />
            <h2>{g?.title || t("Loading...")}</h2>
            <button type="button" className="aer-icon" onClick={onClose} aria-label={t("Close")}>
              <X size={16} />
            </button>
          </header>
          {err ? <p className="aer-err" role="alert">{err}</p> : null}
          {g ? (
            <div className="aer-dbody">
              <div className="aer-facts">
                <div><span>{t("admin.errCount")}</span><b>{g.count}</b></div>
                <div><span>{t("admin.errUsers")}</span><b>{g.users}</b></div>
                <div><span>{t("admin.errFirst")}</span><b>{formatAppDateTime(g.firstSeen, locale)}</b></div>
                <div><span>{t("admin.errLast")}</span><b>{formatAppDateTime(g.lastSeen, locale)}</b></div>
              </div>
              <PlatformChips platforms={g.platforms} t={t} />
              {g.frame ? <p className="aer-frame"><code>{g.frame}</code></p> : null}
              <section className="aer-stack">
                <div className="aer-stack-head">
                  <b>{t("admin.errLatest")}</b>
                  <button type="button" className="aer-ghost" onClick={copy}>
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t("admin.errCopied") : t("admin.errCopy")}
                  </button>
                </div>
                <pre>{ev?.stack || ev?.message || "-"}</pre>
              </section>
              <section>
                <b className="aer-sub">{t("admin.errEvents")}</b>
                <ul className="aer-events">
                  {(data.events || []).map((e) => (
                    <li key={e.id}>
                      <time>{formatAppDateTime(e.at, locale)}</time>
                      <span className="aer-chip">{t(`admin.errPlat_${e.platform}`)}</span>
                      {e.appVersion ? <span className="aer-chip">v{e.appVersion}</span> : null}
                      <span className="aer-muted">{e.username ? `@${e.username}` : t("admin.errAnon")}</span>
                      {e.url ? <span className="aer-url" title={e.url}>{e.url.replace(/^https?:\/\/[^/]+/, "")}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
              <label className="aer-note">
                <span>{t("admin.errNote")}</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} placeholder={t("admin.errNotePh")} />
              </label>
              <div className="aer-actions">
                {g.status !== "ignored" ? (
                  <button type="button" className="aer-ghost" disabled={busy} onClick={() => setStatus("ignored")}>
                    <EyeOff size={14} /> {t("admin.errIgnore")}
                  </button>
                ) : null}
                {g.status !== "open" ? (
                  <button type="button" className="aer-ghost" disabled={busy} onClick={() => setStatus("open")}>
                    <RotateCcw size={14} /> {t("admin.errReopen")}
                  </button>
                ) : null}
                {g.status !== "resolved" ? (
                  <button type="button" className="aer-primary" disabled={busy} onClick={() => setStatus("resolved")}>
                    <Check size={14} /> {t("admin.errResolve")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </OverlayPortal>
  );
}

export default function ErrorIssuesTab() {
  const { t, locale } = useLocale();
  const [range, setRange] = useState("7d");
  const [status, setStatus] = useState("open");
  const [platform, setPlatform] = useState("");
  const [sort, setSort] = useState("recent");
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    setErr("");
    const p = new URLSearchParams({ range, status, sort });
    if (platform) p.set("platform", platform);
    if (q.trim()) p.set("q", q.trim());
    adminFetch(`/error-groups?${p.toString()}`)
      .then(setData)
      .catch((e) => setErr(e?.message || t("admin.errLoadFailed")));
  }, [range, status, sort, platform, q, t]);

  useEffect(() => {
    const id = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, q]);

  const s = data?.stats;
  return (
    <section className="aer">
      <div className="aer-head">
        <span className="aer-head-ic" aria-hidden="true"><Bug size={20} /></span>
        <div>
          <h1>{t("admin.errors")}</h1>
          <p>{t("admin.errLead")}</p>
        </div>
        <button type="button" className="aer-icon" onClick={load} aria-label={t("common.refresh")}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="aer-kpis">
        <div className="aer-kpi"><span>{t("admin.errKpiEvents")}</span><b>{s?.events ?? "–"}</b></div>
        <div className="aer-kpi"><span>{t("admin.errKpiOpen")}</span><b>{s?.open ?? "–"}</b></div>
        <div className={`aer-kpi${s?.newIssues ? " is-warn" : ""}`}><span>{t("admin.errKpiNew")}</span><b>{s?.newIssues ?? "–"}</b></div>
        <div className={`aer-kpi${s?.regressed ? " is-bad" : ""}`}><span>{t("admin.errKpiRegressed")}</span><b>{s?.regressed ?? "–"}</b></div>
        <div className="aer-kpi"><span>{t("admin.errKpiUsers")}</span><b>{s?.users ?? "–"}</b></div>
      </div>

      <div className="aer-bar">
        <div className="aer-seg" role="group" aria-label={t("admin.errRange")}>
          {RANGES.map((r) => (
            <button key={r} type="button" className={range === r ? "is-on" : ""} aria-pressed={range === r} onClick={() => setRange(r)}>{t(`admin.errRange_${r}`)}</button>
          ))}
        </div>
        <div className="aer-seg" role="group" aria-label={t("admin.errStatus")}>
          {STATUSES.map((x) => (
            <button key={x} type="button" className={status === x ? "is-on" : ""} aria-pressed={status === x} onClick={() => setStatus(x)}>{t(`admin.errStatus_${x}`)}</button>
          ))}
        </div>
        <label className="aer-search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.errSearch")} aria-label={t("admin.errSearch")} />
        </label>
        <select className="aer-select" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label={t("admin.errPlatform")}>
          <option value="">{t("admin.errAllPlatforms")}</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{t(`admin.errPlat_${p}`)}</option>)}
        </select>
        <select className="aer-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t("admin.errSort")}>
          <option value="recent">{t("admin.errSort_recent")}</option>
          <option value="count">{t("admin.errSort_count")}</option>
          <option value="users">{t("admin.errSort_users")}</option>
        </select>
      </div>

      {err ? <p className="aer-err" role="alert"><AlertTriangle size={14} /> {err}</p> : null}
      {s?.truncated ? <p className="aer-muted">{t("admin.errTruncated")}</p> : null}
      {!data && !err ? <p className="aer-muted">{t("Loading...")}</p> : null}
      {data && !data.groups.length ? (
        <div className="aer-empty">
          <Check size={22} />
          <b>{t("admin.errEmpty")}</b>
          <span>{t("admin.errEmptyBody")}</span>
        </div>
      ) : null}

      <ul className="aer-list">
        {(data?.groups || []).map((g) => (
          <li key={g.fingerprint}>
            <button type="button" className="aer-row" onClick={() => setOpen(g.fingerprint)}>
              <span className={`aer-dot is-${g.status}`} aria-hidden="true" />
              <span className="aer-main">
                <span className="aer-title">
                  {g.title}
                  {g.isNew ? <span className="aer-tag is-new">{t("admin.errNew")}</span> : null}
                  {g.regressed ? <span className="aer-tag is-bad">{t("admin.errRegressed")}</span> : null}
                </span>
                <span className="aer-meta">
                  {g.frame ? <code>{g.frame}</code> : null}
                  <span>{t("admin.errLastSeen", { when: ago(g.lastSeen, t) })}</span>
                  <PlatformChips platforms={g.platforms} t={t} />
                </span>
              </span>
              <Spark data={g.trend} />
              <span className="aer-num"><b>{g.count}</b><span>{t("admin.errTimes")}</span></span>
              <span className="aer-num"><b><Users size={12} /> {g.users}</b><span>{t("admin.errPeople")}</span></span>
            </button>
          </li>
        ))}
      </ul>
      {open ? <Detail fp={open} t={t} locale={locale} onClose={() => setOpen(null)} onChanged={load} /> : null}
    </section>
  );
}
