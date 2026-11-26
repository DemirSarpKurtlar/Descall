/**
 * "Google'da göster" control desk (UI-BRIEF draft A, Sahip ayarları): left, eye toggles for
 * what the public page shows; middle, the live Google result and the live page (the same
 * HTML the edge serves); right, results (views, Google clicks, joins from the page, top
 * searches from Search Console when synced, where joins come from). Turning it off needs a
 * reason, writes the audit log and can be undone for 10 minutes.
 *
 * mode "window": desktop (Electron, Tauri, web) full window with the settings nav.
 * mode "embedded": inside the server hub on iPhone / iPad (one column, or two on iPad).
 * Backend: routes/publicPages.js. Pure rules: lib/publicPage.js.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useT } from "../../../context/LocaleContext";
import { getPublicPageDesk, savePublicPage, disablePublicPage, undoDisablePublicPage } from "../../../api/publicPage";
import { copyText } from "../../../lib/copyText";
import { formatNumber } from "../../../i18n/format.js";
import {
  BASIC_SECTIONS, HIGHLIGHT_SECTIONS, LIMITS, RANGES, agoParts, clockLeft, diffDraft, draftFromDesk, fromLocalInput, meterState, previewPage, toLocalInput, toggleIn,
} from "../../../lib/publicPage.js";
import { I, Mark } from "./icons";
import { AreaChart, AuditList, DisableDialog, PagePreview, Seg, Serp, SnavItem, SourceBar, Toggle } from "./parts";
import "./publicPageDesk.css";

const ROW = {
  banner: { tile: "purple", icon: "layout" },
  desc: { tile: "teal", icon: "text" },
  tags: { tile: "orange", icon: "tag" },
  count: { tile: "green", icon: "users" },
  chan: { tile: "blue", icon: "hash" },
  ev: { tile: "pink", icon: "cal" },
  rules: { tile: "yellow", icon: "book" },
  pin: { tile: "mint", icon: "pin" },
};

function useWidthClass(ref) {
  const [cls, setCls] = useState("wide");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      const w = el.clientWidth || 1200;
      setCls(w >= 1080 ? "wide" : w >= 720 ? "mid" : "narrow");
    };
    fit();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return cls;
}

function errorText(t, err) {
  if (!err) return "";
  if (err.code === "OFFLINE" || err.status === 0) return t("pubpage.offline");
  const max = err.body?.errorVars?.max ?? err.body?.vars?.max;
  const key = err.code ? `pubpage.errors.${err.code}` : "";
  const out = key ? t(key, { max: max ?? "" }) : "";
  return out && out !== key ? out : t("pubpage.errors.generic");
}

function appTheme() {
  try {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export default function PublicPageDesk({ server, mode = "window", onClose, onNavigate, navItems = null }) {
  const t = useT();
  const { locale } = useLocale();
  const lang = locale || "tr";
  const rootRef = useRef(null);
  const width = useWidthClass(rootRef);
  const [desk, setDesk] = useState(null);
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind: "ok"|"err", text }
  const [days, setDays] = useState(30);
  const [serpTheme, setSerpTheme] = useState("d");
  const [pv, setPv] = useState("d");
  const [open, setOpen] = useState(null); // expanded row: chan | ev | pin
  const [dialog, setDialog] = useState(false);
  const [tick, setTick] = useState(0);
  const serverId = server?.id;

  const apply = useCallback((data) => {
    setDesk(data);
    const d = draftFromDesk(data);
    setSaved(d);
    setDraft(d);
  }, []);

  const load = useCallback(async (signal, nextDays = days) => {
    setLoadErr(null);
    try {
      const data = await getPublicPageDesk(serverId, { days: nextDays, signal });
      apply(data);
    } catch (err) {
      if (err?.name !== "AbortError") setLoadErr(err);
    }
  }, [serverId, days, apply]);

  useEffect(() => {
    if (!serverId) return undefined;
    const ctl = new AbortController();
    load(ctl.signal);
    return () => ctl.abort();
  }, [serverId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Undo countdown and the "saved" message fade.
  const undo = desk?.state?.undo || null;
  useEffect(() => {
    if (!undo) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [undo]);
  useEffect(() => {
    if (!msg || msg.kind !== "ok") return undefined;
    const id = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(id);
  }, [msg]);

  const body = draft && saved ? diffDraft(draft, saved) : null;
  const dirty = Boolean(body);
  const page = useMemo(() => (desk && draft ? previewPage(desk.preview, draft) : null), [desk, draft]);
  const enabled = Boolean(desk?.settings?.enabled);
  const shown = Boolean(desk?.state?.shown);
  const available = desk ? desk.available !== false : true;

  const run = async (fn, okText) => {
    if (busy) return false;
    setBusy(true);
    setMsg(null);
    try {
      const data = await fn();
      apply(data);
      if (okText) setMsg({ kind: "ok", text: okText });
      return true;
    } catch (err) {
      setMsg({ kind: "err", text: errorText(t, err) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onSave = () => dirty && run(() => savePublicPage(serverId, body, { days }), t("pubpage.saved"));
  const onMaster = (next) => {
    if (next) run(() => savePublicPage(serverId, { ...(body || {}), enabled: true }, { days }), t("pubpage.toast.on"));
    else setDialog(true);
  };
  const onDisable = async ({ reason, note }) => {
    const ok = await run(() => disablePublicPage(serverId, { reason, note }, { days }));
    if (ok) setDialog(false);
  };
  const onUndo = () => run(() => undoDisablePublicPage(serverId, { days }), t("pubpage.toast.undone"));
  const onDays = (d) => {
    setDays(d);
    load(undefined, d);
  };
  const onCopy = async () => {
    if (desk?.state?.url && (await copyText(desk.state.url))) setMsg({ kind: "ok", text: t("pubpage.master.copied") });
  };
  const openPage = () => {
    if (!desk?.state?.url) return;
    try {
      window.open(desk.state.url, "_blank", "noopener,noreferrer");
    } catch {
      /* shells may return null */
    }
  };
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // Leaving with unsaved changes asks first (window mode closes the whole desk).
  const requestClose = () => {
    if (dirty && !window.confirm(`${t("pubpage.unsaved")}. ${t("pubpage.discard")}?`)) return;
    onClose?.();
  };
  useEffect(() => {
    if (mode !== "window") return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !dialog) requestClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const chip = !enabled
    ? <span className="ppd-chip" data-testid="ppd-chip">{t("pubpage.chip.off")}</span>
    : shown
      ? <span className="ppd-chip ok" data-testid="ppd-chip"><i className="ppd-dot pulse" />{t("pubpage.chip.live")}</span>
      : <span className="ppd-chip wr" data-testid="ppd-chip">{t("pubpage.chip.hidden")}</span>;

  const header = (
    <div className="ppd-mh">
      <div>
        <div className="ppd-crumbs">{t("pubpage.crumb")}</div>
        <h2>{t("pubpage.title")}</h2>
      </div>
      <span className="sp" />
      {desk ? chip : null}
      {msg ? <span className={`ppd-msg ${msg.kind}`} role={msg.kind === "err" ? "alert" : "status"}>{msg.text}</span> : null}
      <button type="button" className="ppd-btn sm" onClick={openPage} disabled={!desk?.state?.url || !enabled}><I n="ext" s={14} /> {t("pubpage.openPage")}</button>
      <button type="button" className="ppd-btn sm pri" onClick={onSave} disabled={!dirty || busy} data-testid="ppd-save">
        <I n="check" s={14} /> {busy && dirty ? t("pubpage.saving") : t("pubpage.save")}
      </button>
    </div>
  );

  let content;
  if (!desk && !loadErr) {
    content = <div className="ppd-state" role="status"><span className="ppd-spin" />{t("pubpage.loading")}</div>;
  } else if (!desk && loadErr) {
    content = (
      <div className="ppd-state" role="alert">
        <I n="alert" s={20} />
        <div>{loadErr.code === "ADMIN_REQUIRED" || loadErr.status === 403 ? t("pubpage.noAccess") : loadErr.status === 0 || loadErr.code === "OFFLINE" ? t("pubpage.offline") : t("pubpage.loadError")}</div>
        {loadErr.status === 403 ? null : <button type="button" className="ppd-btn sm" onClick={() => load()}>{t("pubpage.retry")}</button>}
      </div>
    );
  } else {
    content = DeskBody();
  }

  function Shown() {
    const total = 1 + BASIC_SECTIONS.length + HIGHLIGHT_SECTIONS.length;
    const on = 1 + [...BASIC_SECTIONS, ...HIGHLIGHT_SECTIONS].filter((k) => !draft.hidden.includes(k)).length;
    const pv = desk.preview || {};
    const nChan = (desk.channels?.text?.length || 0) + (desk.channels?.voice?.length || 0) - draft.hiddenChannels.length;
    const sub = {
      banner: pv.bannerUrl ? t("pubpage.shown.subs.banner") : t("pubpage.shown.subs.bannerNone"),
      desc: pv.description ? t("pubpage.shown.subs.desc") : t("pubpage.shown.subs.descNone"),
      tags: t("pubpage.shown.subs.tags"),
      count: desk.state?.memberCount != null ? `${t("pubpage.memberCount", { n: formatNumber(desk.state.memberCount, lang) })} · ${t("pubpage.shown.subs.count")}` : t("pubpage.shown.subs.count"),
      chan: t("pubpage.shown.subs.chan", { n: Math.max(0, nChan) }),
      ev: draft.events.length ? t("pubpage.shown.subs.ev", { n: draft.events.length }) : t("pubpage.shown.subs.evNone"),
      rules: pv.rules?.length ? t("pubpage.shown.subs.rules") : t("pubpage.shown.subs.rulesNone"),
      pin: draft.pin.trim() ? t("pubpage.shown.subs.pin") : t("pubpage.shown.subs.pinNone"),
    };
    const row = (k) => {
      const off = draft.hidden.includes(k);
      const name = t(`pubpage.shown.items.${k}`);
      const expandable = k === "chan" || k === "ev" || k === "pin";
      return (
        <div key={k}>
          <div className={`it${off ? " off" : ""}`}>
            <span className={`ico c-${ROW[k].tile}`}><I n={ROW[k].icon} s={14} /></span>
            {expandable ? (
              <button type="button" className="gr exp" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
                {name}<div className="sub">{sub[k]}</div>
                <I n={open === k ? "chevd" : "chev"} s={13} className="chev" />
              </button>
            ) : (
              <div className="gr">{name}<div className="sub">{sub[k]}</div></div>
            )}
            <button type="button" className={`eye${off ? " off" : ""}`} aria-pressed={!off} aria-label={off ? t("pubpage.shown.show", { name }) : t("pubpage.shown.hide", { name })} onClick={() => set({ hidden: toggleIn(draft.hidden, k) })} data-testid={`ppd-eye-${k}`}>
              <I n={off ? "eyeoff" : "eye"} s={15} />
            </button>
          </div>
          {open === k && k === "chan" ? ChannelPicker() : null}
          {open === k && k === "ev" ? EventsEditor() : null}
          {open === k && k === "pin" ? PinEditor() : null}
        </div>
      );
    };
    return (
      <div className="ppd-card ppd-shown">
        <h4>{t("pubpage.shown.title")} <span className="sp" /><small>{t("pubpage.shown.count", { on, total })}</small></h4>
        <div className="ppd-lst">
          <div className="it">
            <span className="ico c-gray"><I n="image" s={14} /></span>
            <div className="gr">{t("pubpage.shown.items.name")}<div className="sub">{t("pubpage.shown.always")}</div></div>
            <span className="eye lk" aria-label={t("pubpage.shown.always")}><I n="lock" s={14} /></span>
          </div>
          {BASIC_SECTIONS.map(row)}
          <div className="it grp">{t("pubpage.shown.highlights")}</div>
          {HIGHLIGHT_SECTIONS.map(row)}
        </div>
      </div>
    );
  }

  function ChannelPicker() {
    const list = [...(desk.channels?.text || []).map((c) => ({ ...c, kind: "text" })), ...(desk.channels?.voice || []).map((c) => ({ ...c, kind: "voice" }))];
    return (
      <div className="ppd-sub">
        <div className="ppd-note">{t("pubpage.channels.sub", { n: desk.channels?.lockedCount || 0 })}</div>
        {list.length ? list.map((c) => {
          const off = draft.hiddenChannels.includes(String(c.id).toLowerCase());
          return (
            <label key={c.id} className={`ppd-chk${off ? " off" : ""}`}>
              <input type="checkbox" checked={!off} onChange={() => set({ hiddenChannels: toggleIn(draft.hiddenChannels, String(c.id).toLowerCase()) })} />
              <I n={c.kind === "voice" ? "vol" : "hash"} s={14} />
              <span>{c.name}</span>
            </label>
          );
        }) : <div className="ppd-note">{t("pubpage.channels.none")}</div>}
      </div>
    );
  }

  function EventsEditor() {
    const upd = (i, patch) => set({ events: draft.events.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
    return (
      <div className="ppd-sub">
        <div className="ppd-note"><I n="google" s={12} /> {t("pubpage.events.google")}</div>
        {draft.events.map((e, i) => (
          <div className="ppd-ev" key={e.key}>
            <input className="ppd-inp" value={e.title} maxLength={LIMITS.eventTitleMax} placeholder={t("pubpage.events.titlePh")} aria-label={t("pubpage.events.titlePh")} onChange={(ev) => upd(i, { title: ev.target.value })} />
            <div className="row2">
              <label>{t("pubpage.events.start")}<input className="ppd-inp" type="datetime-local" value={toLocalInput(e.startsAt)} onChange={(ev) => upd(i, { startsAt: fromLocalInput(ev.target.value) })} /></label>
              <label>{t("pubpage.events.end")}<input className="ppd-inp" type="datetime-local" value={toLocalInput(e.endsAt)} onChange={(ev) => upd(i, { endsAt: fromLocalInput(ev.target.value) })} /></label>
            </div>
            <div className="row2">
              <input className="ppd-inp" value={e.place} maxLength={LIMITS.placeMax} placeholder={t("pubpage.events.placePh")} aria-label={t("pubpage.events.place")} onChange={(ev) => upd(i, { place: ev.target.value })} />
              <button type="button" className="ppd-btn sm ghost" onClick={() => set({ events: draft.events.filter((_, j) => j !== i) })} aria-label={t("pubpage.events.remove")}><I n="trash" s={14} /></button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="ppd-btn sm"
          disabled={draft.events.length >= LIMITS.eventsMax}
          onClick={() => {
            const start = new Date(Date.now() + 2 * 86400000);
            start.setMinutes(0, 0, 0);
            start.setHours(21);
            set({ events: [...draft.events, { key: `n${Date.now()}`, title: "", startsAt: start.toISOString(), endsAt: "", place: "" }] });
          }}
        >
          <I n="plus" s={14} /> {draft.events.length >= LIMITS.eventsMax ? t("pubpage.events.max", { n: LIMITS.eventsMax }) : t("pubpage.events.add")}
        </button>
      </div>
    );
  }

  function PinEditor() {
    return (
      <div className="ppd-sub">
        <textarea className="ppd-inp" rows={3} maxLength={LIMITS.pinMax} value={draft.pin} placeholder={t("pubpage.pin.ph")} aria-label={t("pubpage.pin.title")} onChange={(e) => set({ pin: e.target.value })} />
        <div className="ppd-meter"><span /><span className="ok">{draft.pin.length} / {LIMITS.pinMax}</span></div>
      </div>
    );
  }

  function Master() {
    const st = desk.state || {};
    const ago = agoParts(st.lastCrawlAt);
    const idx = st.indexed || "off";
    const noVanity = !st.slug;
    return (
      <div className={`ppd-master${enabled ? "" : " off"}`}>
        <div className="t">
          <span className="tile c-blue"><I n="search" s={20} /></span>
          <div style={{ flex: 1 }}><b>{t("pubpage.master.title")}</b><small>{t("pubpage.master.sub")}</small></div>
          <Toggle large on={enabled} disabled={busy || !available || (noVanity && !enabled)} onChange={onMaster} label={t("pubpage.master.toggle")} />
        </div>
        <div className="st">
          <span className={`ppd-chip${idx === "indexed" ? " ok" : idx === "off" ? "" : " br"}`}>{t(`pubpage.index.${idx}`)}</span>
          {enabled ? <span>{ago ? t("pubpage.index.crawledAgo", { ago: t(`pubpage.ago.${ago.key}`, { n: ago.n }) }) : t("pubpage.index.never")}</span> : null}
        </div>
        {st.url ? (
          <div className="ppd-urlrow"><span>{st.url.replace(/^https:\/\//, "")}</span><button type="button" className="ppd-btn sm ghost" onClick={onCopy} aria-label={t("pubpage.master.copy")} title={t("pubpage.master.copy")}><I n="copy" s={14} /></button></div>
        ) : <div className="ppd-note warn">{t("pubpage.master.noVanity")}</div>}
        {!available ? <div className="ppd-note warn">{t("pubpage.reason.unavailable")}</div> : null}
        {enabled && !shown && st.reason ? <div className="ppd-note warn" role="status">{t(`pubpage.reason.${st.reason}`, { min: st.minMembers, count: st.memberCount })}</div> : null}
      </div>
    );
  }

  function SearchText() {
    const tl = draft.title.length;
    const dl = draft.description.length;
    return (
      <div className="ppd-card">
        <h4><I n="google" s={15} /> {t("pubpage.text.title")}</h4>
        <div className="ppd-field">
          <label htmlFor="ppd-title">{t("pubpage.text.label")}</label>
          <input id="ppd-title" className="ppd-inp" value={draft.title} maxLength={LIMITS.titleMax} placeholder={page ? page.name : ""} onChange={(e) => set({ title: e.target.value })} data-testid="ppd-title" />
          <div className="ppd-meter"><span>{t("pubpage.text.titleHint", { n: LIMITS.titleShown })}</span><span className={meterState(tl, LIMITS.titleShown)} data-testid="ppd-title-count">{tl} / {LIMITS.titleShown}</span></div>
        </div>
        <div className="ppd-field" style={{ marginTop: 10 }}>
          <label htmlFor="ppd-desc">{t("pubpage.text.desc")}</label>
          <textarea id="ppd-desc" className="ppd-inp" rows={3} value={draft.description} maxLength={LIMITS.descriptionMax} onChange={(e) => set({ description: e.target.value })} />
          <div className="ppd-meter"><span>{t("pubpage.text.descHint")}</span><span className={meterState(dl, LIMITS.descriptionShown)}>{dl} / {LIMITS.descriptionShown}</span></div>
        </div>
      </div>
    );
  }

  function Results() {
    const s = desk.stats || {};
    const tot = s.totals || {};
    const sc = desk.search;
    const pct = (d) => (d == null ? null : `${d > 0 ? "+" : ""}${d}%`);
    const empty = !tot.views && !tot.joins && !(sc && sc.clicks);
    const kpi = (icon, label, value, sub, down) => (
      <div className="ppd-kpi">
        <div className="l"><I n={icon} s={12} /> {label}</div>
        <div className="v">{value}</div>
        {sub ? <div className={`d${down ? " dn" : ""}`}>{sub}</div> : null}
      </div>
    );
    const vd = s.deltas?.views;
    return (
      <>
        <div className="ppd-card" data-testid="ppd-results">
          <h4><I n="chart" s={15} /> {t("pubpage.results.title")} <span className="sp" />
            <Seg value={days} onChange={onDays} label={t("pubpage.results.title")} options={RANGES.map((d) => ({ v: d, label: t("pubpage.results.range", { n: d }) }))} />
          </h4>
          <div className="ppd-kpis">
            {kpi("eye", t("pubpage.results.views"), formatNumber(tot.views || 0, lang), vd != null ? t("pubpage.results.vsPrev", { d: pct(vd), n: days }) : null, vd != null && vd < 0)}
            {sc
              ? kpi("google", t("pubpage.results.google"), formatNumber(sc.clicks || 0, lang), sc.position != null ? t("pubpage.results.avgPos", { p: formatNumber(sc.position, lang) }) : null)
              : kpi("google", t("pubpage.results.googleOwn"), formatNumber(tot.googleVisits || 0, lang), t("pubpage.results.fromVisits"))}
            {kpi("users", t("pubpage.results.joins"), formatNumber(tot.joins || 0, lang), tot.joinsLast7 ? t("pubpage.results.thisWeek", { n: tot.joinsLast7 }) : null)}
            {kpi("zap", t("pubpage.results.conversion"), tot.conversion != null ? `${formatNumber(tot.conversion, lang)}%` : "–", t("pubpage.results.convSub"))}
          </div>
          {empty ? <div className="ppd-note" style={{ marginTop: 10 }}>{t("pubpage.results.empty")}</div> : (
            <div style={{ marginTop: 10 }}>
              <AreaChart series={s.series || []} lang={lang} t={t} />
              <div className="ppd-legend"><span><i style={{ background: "#8FA6FF" }} />{t("pubpage.results.legendViews")}</span><span><i style={{ background: "#2AD4B8" }} />{t("pubpage.results.legendGoogle")}</span></div>
            </div>
          )}
        </div>
        <div className="ppd-card ppd-terms">
          <h4><I n="search" s={15} /> {t("pubpage.results.terms")} <span className="sp" /><small>{t("pubpage.results.termsUnit")}</small></h4>
          {sc?.terms?.length ? (
            <div className="ppd-lst">
              {sc.terms.map((term) => (
                <div className="it" key={term.query}>
                  <span>{term.query}</span><b className="tnum">{formatNumber(term.clicks, lang)}</b>
                  <div className="ppd-hbar"><i style={{ width: `${Math.max(4, (term.clicks / Math.max(1, sc.terms[0].clicks)) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          ) : <div className="ppd-note">{t("pubpage.results.termsNone")}</div>}
        </div>
        <div className="ppd-card">
          {tot.joins ? (
            <>
              <h4><I n="users" s={15} /> {t("pubpage.results.sources")} <span className="sp" /><small>{t("pubpage.results.sourcesUnit", { n: formatNumber(tot.joins, lang) })}</small></h4>
              <SourceBar sources={s.sources} field="joins" t={t} />
            </>
          ) : (
            <>
              <h4><I n="users" s={15} /> {t("pubpage.results.visits")} <span className="sp" /><small>{formatNumber(tot.views || 0, lang)}</small></h4>
              <SourceBar sources={s.sources} field="views" t={t} />
            </>
          )}
        </div>
        {enabled ? (
          <button type="button" className="ppd-btn dan wide" onClick={() => setDialog(true)} disabled={busy} data-testid="ppd-disable">
            <I n="eyeoff" s={15} /> {t("pubpage.disable.button")}
          </button>
        ) : null}
      </>
    );
  }

  function Below() {
    return (
      <div className="ppd-below">
        <div className="ppd-card">
          <h4><I n="shield" s={15} /> {t("pubpage.privacy.title")}</h4>
          <div className="ppd-note big">{t("pubpage.privacy.body")}</div>
          <h4 style={{ marginTop: 14 }}><I n="info" s={15} /> {t("pubpage.auto.title")}</h4>
          <div className="ppd-note big">{t("pubpage.auto.body", { min: desk.state?.minMembers ?? 3 })}</div>
        </div>
        <div className="ppd-card">
          <h4><I n="clock" s={15} /> {t("pubpage.audit.title")} <span className="sp" /><small>{t("pubpage.audit.scope")}</small></h4>
          <AuditList entries={desk.audit} lang={lang} t={t} />
        </div>
      </div>
    );
  }

  function DeskBody() {
    const left = (
      <div className="ppd-col">
        {Master()}
        {Shown()}
        {SearchText()}
      </div>
    );
    const mid = (
      <div className="ppd-col" style={{ minWidth: 0 }}>
        <div className="ppd-card">
          <h4><I n="search" s={15} /> {t("pubpage.serp.title")} <span className="sp" />
            <Seg value={serpTheme} onChange={setSerpTheme} label={t("pubpage.serp.title")} options={[{ v: "d", label: t("pubpage.serp.dark") }, { v: "l", label: t("pubpage.serp.light") }]} />
          </h4>
          <Serp page={page} lang={lang} theme={serpTheme} t={t} counts={!draft.hidden.includes("count")} query={desk.search?.terms?.[0]?.query || page?.name} />
        </div>
        <div className="ppd-card" style={{ paddingBottom: 10 }}>
          <h4><I n="eye" s={15} /> {t("pubpage.preview.title")} <span className="sp" />
            <Seg value={pv} onChange={setPv} label={t("pubpage.preview.title")} options={[{ v: "d", label: t("pubpage.preview.desktop"), icon: "monitor" }, { v: "p", label: t("pubpage.preview.phone"), icon: "phone" }]} />
          </h4>
          <PagePreview page={page} lang={lang} mode={pv} theme={appTheme()} label={t("pubpage.preview.frame")} />
          <div className="ppd-cap"><I n="info" s={13} /> {t("pubpage.preview.note")}</div>
        </div>
      </div>
    );
    const right = <div className="ppd-col">{Results()}</div>;
    return (
      <>
        <div className={`ppd-cols ${width}`}>
          {left}
          {mid}
          {right}
        </div>
        {Below()}
      </>
    );
  }

  const left = clockLeft(undo?.until);
  void tick;
  const toast = undo && left ? (
    <div className="ppd-toast" role="status" data-testid="ppd-undo-toast">
      <span className="tile c-gray"><I n="eyeoff" s={15} /></span>
      <div style={{ flex: 1 }}>{t("pubpage.toast.off")}<div className="mut">{t("pubpage.toast.offSub")}</div></div>
      <button type="button" className="ppd-btn sm pri" onClick={onUndo} disabled={busy} data-testid="ppd-undo"><I n="undo" s={14} /> {t("pubpage.toast.undo", { t: left })}</button>
    </div>
  ) : null;

  const main = (
    <div className={`ppd-main ${width}`}>
      {header}
      {dirty ? <div className="ppd-dirty" role="status"><I n="info" s={13} /> {t("pubpage.unsaved")} <button type="button" className="ppd-link" onClick={() => setDraft(saved)}>{t("pubpage.discard")}</button></div> : null}
      {content}
    </div>
  );

  const nav = navItems?.length ? (
    <nav className="ppd-snav" aria-label={t("pubpage.nav.settings")}>
      <div className="srv">
        {server?.iconUrl ? <img src={server.iconUrl} alt="" /> : <span className="ph">{String(server?.name || "?").slice(0, 1)}</span>}
        <div><b>{server?.name}</b>{desk?.state?.memberCount != null ? <small>{t("pubpage.memberCount", { n: formatNumber(desk.state.memberCount, lang) })}</small> : null}</div>
      </div>
      {navItems.map((g) => (
        <div key={g.title}>
          <h6>{g.title}</h6>
          {g.items.map((it) => <SnavItem key={it.key} tile={it.tile} icon={it.icon} label={it.label} on={it.key === "community"} onClick={() => (it.key === "community" ? null : onNavigate?.(it.key))} />)}
        </div>
      ))}
    </nav>
  ) : null;

  const dlg = dialog ? <DisableDialog busy={busy} reasons={desk?.reasons || ["season_break", "too_many_joins", "raid", "other"]} t={t} onCancel={() => setDialog(false)} onConfirm={onDisable} /> : null;

  if (mode === "embedded") {
    return (
      <div className="ppd ppd-embedded" ref={rootRef} data-testid="ppd">
        {main}
        {toast}
        {dlg}
      </div>
    );
  }

  return createPortal(
    <div className="ppd-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div className="ppd ppd-appwin" role="dialog" aria-modal="true" aria-label={t("pubpage.title")} ref={rootRef} data-testid="ppd">
        <div className="ppd-tb">
          <Mark s={16} />
          <b>{t("pubpage.nav.settings")}</b>
          <span>· {server?.name}</span>
          <span className="sp" />
          <button type="button" className="ppd-x" onClick={requestClose} aria-label={t("pubpage.close")}><I n="x" s={14} /></button>
        </div>
        <div className="ppd-sa">
          {width === "narrow" ? null : nav}
          {main}
        </div>
        {toast}
        {dlg}
      </div>
    </div>,
    document.body
  );
}
