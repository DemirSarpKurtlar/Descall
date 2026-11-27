/**
 * Yönetim > Descall+ > Çalışma alanı (owner pick 5B section 4, "Oyunlar / Kredi B" layout):
 * KPIs on top (MRR, subscribers, trials, boosted servers, affected members, gift -> subscriber,
 * refunds) with the draft's "Ölçüm" targets, then tabs. Aboneler = list + the selected person's
 * workspace (membership, boosts, gifts, timeline; Süre ekle, Takviye düzelt, İade et with a reason)
 * + the right column (plans and per-platform prices, trial / ticket switches, gift funnel, İşlem
 * kaydı with undo). Planlar = everything the owner can switch: selling per platform, pilots,
 * prices, tier limits (screen share), levels, store product ids, providers, the 12 moments.
 * Writes go through adminFetch (step-up code) and land in the admin audit log.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { formatDate, formatNumber } from "../../../i18n/format.js";
import { AlertTriangle, Check, Clock, Gift, Loader2, RefreshCw, Rocket, Search, Sparkles, Undo2, Users, Wallet } from "../../ui/Icon.jsx";
import { PAvatar, PlanPill, Switch } from "../../../plus2/ui.jsx";
import { formatPrice, giftChip } from "../../../plus2/model.js";
import "../../../plus2/plus2.css";

const BASE = "/premium/plus";
const json = (method, body) => ({ method, body: JSON.stringify(body) });
const api = {
  overview: () => adminFetch(`${BASE}/overview`),
  people: (filter, q) => adminFetch(`${BASE}/people?filter=${encodeURIComponent(filter)}&q=${encodeURIComponent(q || "")}`),
  person: (id) => adminFetch(`${BASE}/people/${encodeURIComponent(id)}`),
  extend: (id, body) => adminFetch(`${BASE}/people/${encodeURIComponent(id)}/extend`, json("POST", body)),
  boostFix: (id, boostId, body) => adminFetch(`${BASE}/people/${encodeURIComponent(id)}/boosts/${encodeURIComponent(boostId)}`, json("POST", body)),
  refund: (id, body) => adminFetch(`${BASE}/people/${encodeURIComponent(id)}/refund`, json("POST", body)),
  servers: () => adminFetch(`${BASE}/servers`),
  gifts: () => adminFetch(`${BASE}/gifts`),
  refunds: () => adminFetch(`${BASE}/refunds`),
  decide: (id, body) => adminFetch(`${BASE}/refunds/${encodeURIComponent(id)}`, json("POST", body)),
  saveConfig: (patch, note) => adminFetch(`${BASE}/config`, json("PATCH", { patch, note })),
  undo: (historyId) => adminFetch(`${BASE}/config/undo/${encodeURIComponent(historyId)}`, json("POST", {})),
  log: () => adminFetch(`${BASE}/log`),
};

const FILTERS = ["all", "trial", "payment_issue", "cancelling", "refund", "gift_waiting"];
const TABS = ["subscribers", "servers", "gifts", "refunds", "plans"];
const PRICE_ROWS = ["plus_monthly", "plus_yearly", "ultra_monthly", "ultra_yearly", "gift_plus_1", "gift_plus_3", "gift_plus_12", "gift_ultra_3", "gift_ultra_12"];

function Kpi({ label, value, hint, tone = "", live = false }) {
  return (
    <div className="p2-card" style={{ padding: "12px 14px", minWidth: 0 }}>
      <div className="p2-row p2-small p2-muted" style={{ gap: 6 }}>{live ? <span className="p2-dot" style={{ position: "static", boxShadow: "none" }} /> : null}{label}</div>
      <div className="tnum" style={{ fontSize: 24, fontWeight: 780, letterSpacing: "-.02em", margin: "4px 0 2px" }}>{value}</div>
      {hint ? <div className="p2-small" style={{ color: tone === "ok" ? "var(--p2-ok)" : tone === "warn" ? "var(--p2-warn)" : "var(--p2-t3)" }}>{hint}</div> : null}
    </div>
  );
}

function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      setState({ data: await fn(), error: null, loading: false });
    } catch (e) {
      setState({ data: null, error: e?.code || e?.message || "error", loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

function ReasonPrompt({ t, title, onSubmit, onCancel, fields = [], busy }) {
  const [reason, setReason] = useState("");
  const [vals, setVals] = useState({});
  return (
    <div className="p2-card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      <b style={{ fontSize: 13 }}>{title}</b>
      {fields.map((f) => (
        <label key={f.key} className="p2-field"><span>{f.label}</span>
          {f.options ? (
            <select className="p2-select" value={vals[f.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}>
              <option value="">-</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : <input className="p2-input" type={f.type || "text"} value={vals[f.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} />}
        </label>
      ))}
      <label className="p2-field"><span>{t("plus2.admin.reason")}</span><input className="p2-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("plus2.admin.reasonPh")} /></label>
      <div className="p2-row">
        <button type="button" className="p2-btn is-sm is-cta" disabled={!reason.trim() || busy || fields.some((f) => f.required && !vals[f.key])} onClick={() => onSubmit({ ...vals, reason: reason.trim() })}>{busy ? <Loader2 className="p2-spin" /> : <Check />}{t("plus2.admin.confirm")}</button>
        <button type="button" className="p2-btn is-sm is-ghost" onClick={onCancel}>{t("plus2.admin.cancel")}</button>
      </div>
    </div>
  );
}

function PersonDetail({ id, t, locale, onChanged }) {
  const { data, error, loading, reload } = useLoad(() => api.person(id), [id]);
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const d = (v) => (v ? formatDate(v, locale, { day: "numeric", month: "short" }) : "");
  const dt = (v) => (v ? formatDate(v, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
  const run = async (fn) => {
    setBusy(true);
    setMsg(null);
    try {
      const out = await fn();
      setAction(null);
      setMsg(out?.result ? `plus2.admin.refundResult.${out.result}` : "plus2.admin.done");
      reload();
      onChanged?.();
    } catch (e) {
      setMsg(e?.code ? `plus2.admin.err` : "plus2.admin.err");
    } finally {
      setBusy(false);
    }
  };
  if (loading && !data) return <div className="p2-empty"><Loader2 className="p2-spin" /></div>;
  if (error || !data) return <div className="p2-err">{t("plus2.admin.loadError")}</div>;
  const me = data.me || {};
  const boosts = data.boosts || [];
  const activeBoosts = boosts.filter((b) => b.status !== "removed");
  const tx = (data.transactions || []).filter((x) => x.status === "succeeded");
  return (
    <div className="p2-col" style={{ gap: 12 }}>
      <div className="p2-card p2-row" style={{ padding: 14, gap: 12, flexWrap: "wrap" }}>
        <PAvatar user={data.user} size={46} />
        <div className="p2-grow" style={{ minWidth: 200 }}>
          <div className="p2-row" style={{ gap: 6 }}><b style={{ fontSize: 16 }}>{data.user.displayName || data.user.username}</b>{me.plan ? <PlanPill plan={me.plan} /> : null}</div>
          <div className="p2-sub">
            {me.plan ? t("plus2.admin.heroLine", { period: t(me.period === "yearly" ? "plus2.ck.yearly" : "plus2.ck.monthly"), origin: t(`plus2.admin.origin.${me.origin || me.source || "admin"}`), since: d(me.started_at) }) : t("plus2.admin.noPlan")}
            {" · "}{t("plus2.admin.lifetime", { amount: formatPrice(data.lifetimeMinor || 0, data.currency, locale) })}
          </div>
        </div>
        <div className="p2-row" style={{ gap: 6 }}>
          <button type="button" className="p2-btn is-sm" onClick={() => setAction("extend")}>{t("plus2.admin.extend")}</button>
          <button type="button" className="p2-btn is-sm" onClick={() => setAction("boost")} disabled={!boosts.length}>{t("plus2.admin.boostFix")}</button>
          <button type="button" className="p2-btn is-sm is-danger-soft" onClick={() => setAction("refund")} disabled={!tx.length}>{t("plus2.admin.refund")}</button>
        </div>
      </div>
      {action === "extend" ? <ReasonPrompt t={t} busy={busy} title={t("plus2.admin.extend")} fields={[{ key: "days", label: t("plus2.admin.days"), type: "number", required: true }]} onCancel={() => setAction(null)} onSubmit={(v) => run(() => api.extend(id, { days: Number(v.days), reason: v.reason }))} /> : null}
      {action === "boost" ? <ReasonPrompt t={t} busy={busy} title={t("plus2.admin.boostFix")} fields={[
        { key: "boostId", label: t("plus2.admin.boost"), required: true, options: boosts.map((b) => ({ value: b.id, label: `${b.serverName || "?"} · ${t(`plus2.admin.boostStatus.${b.status}`)}` })) },
        { key: "action", label: t("plus2.admin.action"), required: true, options: [{ value: "remove", label: t("plus2.admin.remove") }, { value: "restore", label: t("plus2.admin.restore") }] },
      ]} onCancel={() => setAction(null)} onSubmit={(v) => run(() => api.boostFix(id, v.boostId, { action: v.action, reason: v.reason }))} /> : null}
      {action === "refund" ? <ReasonPrompt t={t} busy={busy} title={t("plus2.admin.refund")} fields={[
        { key: "transactionId", label: t("plus2.admin.payment"), required: true, options: tx.map((x) => ({ value: x.id, label: `${dt(x.created_at)} · ${formatPrice(x.amount_minor, x.currency, locale)} · ${x.provider}` })) },
        { key: "revoke", label: t("plus2.admin.revoke"), options: [{ value: "yes", label: t("plus2.admin.yes") }, { value: "no", label: t("plus2.admin.no") }] },
      ]} onCancel={() => setAction(null)} onSubmit={(v) => run(() => api.refund(id, { transactionId: v.transactionId, reason: v.reason, revoke: v.revoke === "yes" }))} /> : null}
      {msg ? <div className={msg === "plus2.admin.err" ? "p2-err" : "p2-small"} style={msg === "plus2.admin.err" ? undefined : { color: "var(--p2-ok)" }}>{t(msg)}</div> : null}

      <div className="p2-grid2">
        <div className="p2-card" style={{ padding: 12 }}>
          <b style={{ fontSize: 13.5 }}>{t("plus2.admin.boosts")}</b>
          {activeBoosts.length === 0 ? <div className="p2-small p2-muted" style={{ marginTop: 6 }}>{t("plus2.admin.none")}</div> : activeBoosts.map((b) => (
            <div key={b.id} className="p2-row" style={{ marginTop: 8 }}>
              <span className="p2-grow p2-ell" style={{ fontSize: 13 }}>{b.serverName}</span>
              <span className={`p2-pill ${b.level > 0 ? "is-ok" : "is-info"}`}>{t("plus2.admin.levelCount", { level: b.level, count: b.count })}</span>
            </div>
          ))}
          {data.affectedMembers ? <div className="p2-small p2-muted" style={{ marginTop: 8 }}>{t("plus2.admin.affects", { n: formatNumber(data.affectedMembers, locale) })}</div> : null}
        </div>
        <div className="p2-card" style={{ padding: 12 }}>
          <b style={{ fontSize: 13.5 }}>{t("plus2.admin.gifts")}</b>
          {(data.gifts || []).length === 0 ? <div className="p2-small p2-muted" style={{ marginTop: 6 }}>{t("plus2.admin.none")}</div> : data.gifts.slice(0, 5).map((g) => {
            const chip = giftChip(g);
            return (
              <div key={g.id} className="p2-row" style={{ marginTop: 8 }}>
                <span className="p2-grow p2-ell" style={{ fontSize: 13 }}>{(g.direction === "sent" ? g.to : g.from)?.displayName || (g.direction === "sent" ? g.to : g.from)?.username} · {t("plus2.ck.months", { n: g.months })}</span>
                <span className={`p2-pill is-${chip.tone === "muted" ? "" : chip.tone}`}>{t(`plus2.giftStatus.${chip.key}`)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p2-card" style={{ padding: 12 }}>
        <div className="p2-row"><b style={{ fontSize: 13.5 }} className="p2-grow">{t("plus2.admin.timeline")}</b><button type="button" className="p2-btn is-sm is-ghost" onClick={reload} aria-label={t("plus2.admin.refresh")} title={t("plus2.admin.refresh")}><RefreshCw /></button></div>
        {(data.timeline || []).length === 0 ? <div className="p2-small p2-muted">{t("plus2.admin.none")}</div> : (
          <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {data.timeline.slice(0, 30).map((ev, i) => (
              <li key={i} className="p2-row" style={{ alignItems: "flex-start" }}>
                <span className="p2-av is-sq" style={{ width: 26, height: 26, background: "var(--surface-3)", color: "var(--p2-t2)" }}>{ev.type === "gift" ? <Gift size={14} /> : ev.type === "boost" ? <Rocket size={14} /> : ev.type === "payment" ? <Wallet size={14} /> : <Sparkles size={14} />}</span>
                <div className="p2-grow">
                  <div style={{ fontSize: 13 }}>{t(`plus2.admin.tl.${ev.type}.${ev.kind}`, { amount: ev.amountMinor != null ? formatPrice(ev.amountMinor, ev.currency || data.currency, locale) : "", server: ev.serverName || "", name: ev.other?.displayName || ev.other?.username || "", months: ev.months || "", moment: ev.moment || "", status: ev.status || "" })}</div>
                  <div className="p2-sub">{dt(ev.at)}{ev.provider ? ` · ${ev.provider}` : ""}{ev.ref ? ` · ${String(ev.ref).slice(0, 24)}` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PricesCard({ t, locale, cfg, onSave }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const cur = cfg?.currency || "TRY";
  const toMinor = (v) => Math.round(Number(String(v).replace(",", ".")) * 100);
  const save = async () => {
    const patch = {};
    for (const [k, sides] of Object.entries(draft)) {
      for (const [side, v] of Object.entries(sides)) {
        const n = toMinor(v);
        if (Number.isInteger(n) && n >= 0) {
          patch[k] = patch[k] || {};
          patch[k][side] = n;
        }
      }
    }
    if (!Object.keys(patch).length) { setEdit(false); return; }
    setBusy(true);
    try {
      await onSave({ prices: patch }, "prices");
      setEdit(false);
      setDraft({});
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="p2-card" style={{ padding: 12 }}>
      <div className="p2-row"><b className="p2-grow" style={{ fontSize: 13.5 }}>{t("plus2.admin.prices")}</b>
        {edit ? <><button type="button" className="p2-btn is-sm is-cta" onClick={save} disabled={busy}>{t("plus2.admin.publish")}</button><button type="button" className="p2-btn is-sm is-ghost" onClick={() => { setEdit(false); setDraft({}); }}>{t("plus2.admin.cancel")}</button></>
          : <button type="button" className="p2-btn is-sm" onClick={() => setEdit(true)}>{t("plus2.admin.edit")}</button>}
      </div>
      <table className="p2-table" style={{ marginTop: 6 }}>
        <thead><tr><th>{t("plus2.admin.product")}</th><th className="r">{t("plus2.admin.web")}</th><th className="r">{t("plus2.admin.mobile")}</th></tr></thead>
        <tbody>
          {PRICE_ROWS.map((k) => (
            <tr key={k}>
              <td>{t(`plus2.admin.price.${k}`)}</td>
              {["web", "mobile"].map((side) => (
                <td key={side} className="r tnum">
                  {edit ? <input className="p2-input" style={{ width: 92, textAlign: "right", minHeight: 28, padding: "4px 8px" }} defaultValue={((cfg?.prices?.[k]?.[side] ?? 0) / 100).toFixed(2)} onChange={(e) => setDraft((d) => ({ ...d, [k]: { ...(d[k] || {}), [side]: e.target.value } }))} aria-label={`${k} ${side}`} />
                    : formatPrice(cfg?.prices?.[k]?.[side] ?? 0, cur, locale).replace(/\s?₺$/, "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Funnel({ t, f }) {
  const rows = [["bought", f?.bought], ["opened", f?.opened], ["boosted", f?.boosted], ["subscribed", f?.subscribed]];
  const max = Math.max(1, ...rows.map(([, v]) => Number(v) || 0));
  return (
    <div className="p2-card" style={{ padding: 12 }}>
      <b style={{ fontSize: 13.5 }}>{t("plus2.admin.funnel")}</b>
      {rows.map(([k, v]) => (
        <div key={k} className="p2-row" style={{ marginTop: 8 }}>
          <span className="p2-small" style={{ width: 104 }}>{t(`plus2.admin.funnelRow.${k}`)}</span>
          <div className="p2-grow"><div className="p2-bar"><i style={{ width: `${Math.round(((Number(v) || 0) / max) * 100)}%` }} /></div></div>
          <b className="tnum" style={{ width: 28, textAlign: "right", fontSize: 13 }}>{v ?? 0}</b>
        </div>
      ))}
    </div>
  );
}

function LogCard({ t, locale, onUndo }) {
  const { data, reload } = useLoad(() => api.log(), []);
  const [busy, setBusy] = useState(null);
  const rows = useMemo(() => {
    const out = [];
    for (const h of data?.config || []) out.push({ kind: "config", id: h.id, at: h.created_at, text: t("plus2.admin.logConfig", { what: (h.changed || []).slice(0, 3).join(", ") }), undo: !h.undo_of && h.note !== "undo" });
    for (const a of data?.audit || []) out.push({ kind: "audit", id: a.id, at: a.at, text: t("plus2.admin.logAudit", { who: a.actor_username || "-", action: a.action, target: a.target_username || "" }) });
    for (const w of data?.webhooks || []) if (w.status === "failed") out.push({ kind: "hook", id: `${w.provider}-${w.received_at}`, at: w.received_at, text: t("plus2.admin.logHook", { provider: w.provider, type: w.event_type || "", error: w.error || "" }), warn: true });
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 14);
  }, [data, t]);
  return (
    <div className="p2-card" style={{ padding: 12 }}>
      <div className="p2-row"><b className="p2-grow" style={{ fontSize: 13.5 }}>{t("plus2.admin.log")}</b><span className="p2-dot" style={{ position: "static" }} /></div>
      {rows.length === 0 ? <div className="p2-small p2-muted" style={{ marginTop: 6 }}>{t("plus2.admin.none")}</div> : rows.map((r) => (
        <div key={`${r.kind}-${r.id}`} className="p2-row" style={{ marginTop: 8, alignItems: "flex-start" }}>
          {r.warn ? <AlertTriangle size={14} style={{ color: "var(--p2-warn)", marginTop: 2 }} /> : <Clock size={14} style={{ color: "var(--p2-t3)", marginTop: 2 }} />}
          <div className="p2-grow"><div className="p2-small" style={{ color: "var(--p2-t1)" }}>{r.text}</div><div className="p2-sub">{formatDate(r.at, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div></div>
          {r.undo ? <button type="button" className="p2-btn is-sm is-ghost" disabled={busy === r.id} onClick={async () => { setBusy(r.id); try { await onUndo(r.id); reload(); } finally { setBusy(null); } }}><Undo2 />{t("plus2.admin.undo")}</button> : null}
        </div>
      ))}
    </div>
  );
}

function PlansTab({ t, locale, ov, onSave }) {
  const cfg = ov?.config;
  const [pilot, setPilot] = useState("");
  if (!cfg) return null;
  const tierRow = (tier) => (
    <tr key={tier}>
      <td><PlanPill plan={tier === "free" ? null : tier} /></td>
      <td><select className="p2-select" style={{ width: 96 }} value={cfg.tiers[tier].screenHeight} onChange={(e) => onSave({ tiers: { [tier]: { screenHeight: Number(e.target.value) } } }, "tiers")}>{[720, 1080, 1440].map((h) => <option key={h} value={h}>{h}p</option>)}</select></td>
      <td><select className="p2-select" style={{ width: 80 }} value={cfg.tiers[tier].screenFps} onChange={(e) => onSave({ tiers: { [tier]: { screenFps: Number(e.target.value) } } }, "tiers")}>{[15, 20, 24, 30, 60].map((f) => <option key={f} value={f}>{f}</option>)}</select></td>
      <td className="tnum">{tier === "free" ? "-" : cfg.tiers[tier].boosts}</td>
      <td className="tnum">{tier === "free" ? "-" : cfg.tiers[tier].tickets}</td>
    </tr>
  );
  return (
    <div className="p2-col" style={{ gap: 14 }}>
      <div className="p2-card" style={{ padding: 14 }}>
        <b>{t("plus2.admin.sales")}</b>
        <div className="p2-sub" style={{ marginBottom: 10 }}>{t("plus2.admin.salesSub")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {["web", "desktop", "ios", "android"].map((p) => (
            <label key={p} className="p2-row p2-card" style={{ padding: "10px 12px" }}>
              <span className="p2-grow"><b style={{ fontSize: 13 }}>{t(`plus2.admin.platform.${p}`)}</b><span className="p2-sub" style={{ display: "block" }}>{t(cfg.sales[p] ? "plus2.admin.on" : "plus2.admin.off")}</span></span>
              <Switch checked={cfg.sales[p]} onChange={(v) => onSave({ sales: { [p]: v } }, `sales.${p}`)} label={t(`plus2.admin.platform.${p}`)} />
            </label>
          ))}
        </div>
        <div className="p2-row" style={{ marginTop: 10 }}>
          <input className="p2-input" value={pilot} onChange={(e) => setPilot(e.target.value)} placeholder={t("plus2.admin.pilotPh")} />
          <button type="button" className="p2-btn is-sm" disabled={!/^[0-9a-f-]{36}$/i.test(pilot.trim())} onClick={() => { onSave({ pilotUserIds: [...(cfg.pilotUserIds || []), pilot.trim()] }, "pilots"); setPilot(""); }}>{t("plus2.admin.addPilot")}</button>
        </div>
        {(cfg.pilotUserIds || []).length ? <div className="p2-small p2-muted" style={{ marginTop: 6 }}>{t("plus2.admin.pilots", { n: cfg.pilotUserIds.length })} <button type="button" className="p2-btn is-sm is-ghost" onClick={() => onSave({ pilotUserIds: [] }, "pilots")}>{t("plus2.admin.clearPilots")}</button></div> : null}
      </div>
      <div className="p2-card" style={{ padding: 14 }}>
        <b>{t("plus2.admin.features")}</b>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 10 }}>
          {Object.keys(cfg.features).map((k) => (
            <label key={k} className="p2-row" style={{ fontSize: 13 }}><Switch checked={cfg.features[k]} onChange={(v) => onSave({ features: { [k]: v } }, `features.${k}`)} label={t(`plus2.admin.feature.${k}`)} /><span>{t(`plus2.admin.feature.${k}`)}</span></label>
          ))}
        </div>
      </div>
      <div className="p2-card" style={{ padding: 14 }}>
        <b>{t("plus2.admin.tiers")}</b>
        <div className="p2-sub">{t("plus2.admin.tiersSub")}</div>
        <table className="p2-table" style={{ marginTop: 8 }}>
          <thead><tr><th /><th>{t("plus2.admin.screenH")}</th><th>{t("plus2.admin.screenFps")}</th><th>{t("plus2.admin.boostSlots")}</th><th>{t("plus2.admin.ticketsMonth")}</th></tr></thead>
          <tbody>{["free", "plus", "ultra"].map(tierRow)}</tbody>
        </table>
      </div>
      <div className="p2-card" style={{ padding: 14 }}>
        <b>{t("plus2.admin.providers")}</b>
        <table className="p2-table" style={{ marginTop: 8 }}>
          <tbody>
            {(ov.providers || []).map((p) => (
              <tr key={p.id}>
                <td><b>{t(`plus2.provider.${p.id}`)}</b></td>
                <td>{p.configured ? <span className="p2-pill is-ok"><Check />{t("plus2.admin.configured")}</span> : <span className="p2-pill is-warn">{p.notBuilt ? t("plus2.admin.notBuilt") : t("plus2.admin.notConfigured")}</span>}</td>
                <td className="p2-small p2-muted">{p.configured || p.notBuilt ? "" : t("plus2.admin.missingEnv", { list: (p.missing || []).join(", ") })}</td>
                <td className="p2-small p2-muted">{p.webhook || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p2-card" style={{ padding: 14 }}>
        <b>{t("plus2.admin.moments")}</b>
        <div className="p2-sub">{t("plus2.admin.momentsSub", { perDay: cfg.paywall.perDay, hours: cfg.paywall.minAccountHours, ask: cfg.paywall.giftAskPerWeek })}</div>
        <table className="p2-table" style={{ marginTop: 8 }}>
          <thead><tr><th>#</th><th>{t("plus2.admin.moment")}</th><th>{t("plus2.admin.rule")}</th><th className="r">{t("plus2.admin.shown30")}</th><th className="r">{t("plus2.admin.clicked30")}</th><th className="r">{t("plus2.admin.converted30")}</th></tr></thead>
          <tbody>
            {(ov.moments || []).map((m) => {
              const f = ov.metrics?.paywall_30d?.[m.id] || {};
              return (
                <tr key={m.id}>
                  <td className="tnum">{m.n || "-"}</td>
                  <td>{t(`plus2.moment.${m.id}`)}</td>
                  <td className="p2-small p2-muted">{t(`plus2.admin.kind.${m.kind}`)}</td>
                  <td className="r tnum">{(f.shown || 0) + (f.compact || 0)}</td>
                  <td className="r tnum">{f.clicked || 0}</td>
                  <td className="r tnum">{(f.checkout || 0) + (f.trial_started || 0) + (f.converted || 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PlusWorkspace() {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState("subscribers");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [saveErr, setSaveErr] = useState(null);
  const ov = useLoad(() => api.overview(), []);
  const people = useLoad(() => api.people(filter, q), [filter, q]);
  const m = ov.data?.metrics || {};
  const cfg = ov.data?.config;
  const n = (v) => (v == null ? t("plus2.admin.noData") : formatNumber(v, locale));
  const providersLive = (ov.data?.providers || []).filter((p) => p.configured).map((p) => t(`plus2.provider.${p.id}`));
  const salesPlatforms = cfg ? Object.entries(cfg.sales).filter(([, v]) => v).map(([k]) => t(`plus2.admin.platform.${k}`)) : [];

  const saveConfig = async (patch, note) => {
    setSaveErr(null);
    try {
      await api.saveConfig(patch, note);
      await ov.reload();
    } catch (e) {
      setSaveErr(e?.code || "error");
    }
  };
  const undo = async (historyId) => {
    await api.undo(historyId);
    await ov.reload();
  };

  useEffect(() => {
    if (!sel && people.data?.people?.length) setSel(people.data.people[0].userId);
  }, [people.data, sel]);

  return (
    <div className="p2" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="p2-row" style={{ flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{t("plus2.admin.title")}</h2>
        <div className="p2-seg" role="tablist">
          {TABS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {t(`plus2.admin.tab.${k}`)}{k === "refunds" && m.refunds_pending ? ` · ${m.refunds_pending}` : ""}
            </button>
          ))}
        </div>
        <span className="p2-grow" />
        {salesPlatforms.length ? (
          <span className="p2-pill is-ok"><span className="p2-gif-live" />{t("plus2.admin.liveOn", { list: salesPlatforms.join(", "), providers: providersLive.join(", ") || "-" })}</span>
        ) : <span className="p2-pill is-warn">{t("plus2.admin.liveOff")}</span>}
        <button type="button" className="p2-btn is-sm is-ghost" onClick={() => { ov.reload(); people.reload(); }} aria-label={t("plus2.admin.refresh")}><RefreshCw /></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <Kpi live label={t("plus2.admin.kpi.mrr")} value={m.mrr_minor != null ? formatPrice(m.mrr_minor, cfg?.currency, locale) : t("plus2.admin.noData")} hint={t("plus2.admin.kpi.mrrHint")} />
        <Kpi label={t("plus2.admin.kpi.subs")} value={n(m.subscribers)} hint={t("plus2.admin.kpi.subsHint", { n: n(ov.data?.newSubscribers30d ?? m.subscribers_new_30d ?? 0) })} tone="ok" />
        <Kpi label={t("plus2.admin.kpi.trial")} value={n(m.in_trial)} hint={t("plus2.admin.kpi.trialHint", { n: n(m.in_trial_ticket ?? 0) })} />
        <Kpi label={t("plus2.admin.kpi.boosted")} value={n(m.boosted_servers)} hint={t("plus2.admin.kpi.target", { n: ov.data?.targets?.boostedServers ?? 40 })} tone={(m.boosted_servers || 0) >= (ov.data?.targets?.boostedServers ?? 40) ? "ok" : "warn"} />
        <Kpi label={t("plus2.admin.kpi.affected")} value={n(m.affected_members)} hint={m.affected_per_payer != null ? t("plus2.admin.kpi.perPayer", { n: m.affected_per_payer }) : ""} />
        <Kpi label={t("plus2.admin.kpi.giftConv")} value={m.gift_conversion != null ? `%${formatNumber(m.gift_conversion, locale)}` : t("plus2.admin.noData")} hint={t("plus2.admin.kpi.targetPct", { n: ov.data?.targets?.giftConversion ?? 20 })} tone={(m.gift_conversion || 0) >= 20 ? "ok" : "warn"} />
        <Kpi label={t("plus2.admin.kpi.refund")} value={m.refund_rate != null ? `%${formatNumber(m.refund_rate, locale)}` : t("plus2.admin.noData")} hint={t("plus2.admin.kpi.pending", { n: m.refunds_pending ?? 0 })} />
      </div>
      <div className="p2-moment is-teal" style={{ padding: "9px 12px" }}><span className="p2-small"><b>{t("plus2.admin.olcum")}</b> {t("plus2.admin.olcumBody")}</span></div>
      {saveErr ? <div className="p2-err">{t("plus2.admin.saveError", { code: saveErr })}</div> : null}

      {tab === "subscribers" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(250px, 320px) minmax(0, 1fr) minmax(260px, 340px)", gap: 14, alignItems: "start" }} className="p2-ws">
          <div className="p2-card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <label className="p2-row p2-input" style={{ padding: "0 10px" }}><Search size={15} /><input style={{ border: 0, background: "none", outline: 0, color: "inherit", flex: 1, minHeight: 34 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("plus2.admin.search")} aria-label={t("plus2.admin.search")} /></label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {FILTERS.map((f) => (
                <button key={f} type="button" className={`p2-pill${filter === f ? " is-info" : ""}`} style={{ border: 0, cursor: "pointer" }} onClick={() => setFilter(f)}>{t(`plus2.admin.filter.${f}`)} {people.data?.counts?.[f] ?? ""}</button>
              ))}
            </div>
            {people.loading && !people.data ? <div className="p2-empty"><Loader2 className="p2-spin" /></div> : null}
            {(people.data?.people || []).length === 0 && !people.loading ? <div className="p2-empty">{t("plus2.admin.emptyList")}</div> : null}
            {(people.data?.people || []).map((p) => {
              const chip = p.refund ? ["is-danger", "refundAsked"] : p.paymentIssue ? ["is-danger", "paymentIssue"] : p.trial ? ["is-warn", "trial"] : p.cancelling ? ["is-warn", "cancelling"] : p.giftWaiting ? ["", "giftWaiting"] : p.active ? ["is-ok", "active"] : ["", "inactive"];
              return (
                <button key={p.userId} type="button" className="p2-friend" style={{ border: 0, textAlign: "left", width: "100%", background: sel === p.userId ? "var(--primary-soft)" : undefined, boxShadow: sel === p.userId ? "inset 0 0 0 .5px color-mix(in srgb, var(--primary) 50%, transparent)" : undefined, padding: 8 }} onClick={() => setSel(p.userId)}>
                  <PAvatar user={p.user} size={32} />
                  <span className="p2-grow">
                    <b className="p2-ell" style={{ display: "block", fontSize: 13 }}>{p.user.displayName || p.user.username}</b>
                    <span className="p2-sub p2-ell" style={{ display: "block" }}>{p.plan ? `${t(`plus2.plan.${p.plan}`)} ${p.period ? t(p.period === "yearly" ? "plus2.ck.yearly" : "plus2.ck.monthly").toLowerCase() : ""}` : t("plus2.admin.noPlan")}{p.platform ? ` · ${t(`plus2.admin.platform.${p.platform}`)}` : ""}</span>
                  </span>
                  <span className={`p2-pill ${chip[0]}`}>{t(`plus2.admin.chip.${chip[1]}`)}</span>
                </button>
              );
            })}
          </div>
          <div>{sel ? <PersonDetail key={sel} id={sel} t={t} locale={locale} onChanged={() => { people.reload(); ov.reload(); }} /> : <div className="p2-empty">{t("plus2.admin.pick")}</div>}</div>
          <div className="p2-col" style={{ gap: 12 }}>
            {cfg ? <PricesCard t={t} locale={locale} cfg={cfg} onSave={saveConfig} /> : null}
            {cfg ? (
              <div className="p2-card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <label className="p2-row" style={{ fontSize: 13 }}><span className="p2-grow">{t("plus2.admin.trialToggle", { days: cfg.trial.days })}</span><Switch checked={cfg.features.trial} onChange={(v) => saveConfig({ features: { trial: v } }, "features.trial")} label={t("plus2.admin.trialToggle", { days: cfg.trial.days })} /></label>
                <label className="p2-row" style={{ fontSize: 13 }}><span className="p2-grow">{t("plus2.admin.ticketToggle", { n: cfg.tickets.perMonth })}</span><Switch checked={cfg.features.tickets} onChange={(v) => saveConfig({ features: { tickets: v } }, "features.tickets")} label={t("plus2.admin.ticketToggle", { n: cfg.tickets.perMonth })} /></label>
              </div>
            ) : null}
            <Funnel t={t} f={m.gift_funnel_30d} />
            <LogCard t={t} locale={locale} onUndo={undo} />
          </div>
        </div>
      ) : null}
      {tab === "servers" ? <ServersTab t={t} /> : null}
      {tab === "gifts" ? <GiftsTab t={t} locale={locale} /> : null}
      {tab === "refunds" ? <RefundsTab t={t} locale={locale} onChanged={ov.reload} /> : null}
      {tab === "plans" ? <PlansTab t={t} locale={locale} ov={ov.data} onSave={saveConfig} /> : null}
    </div>
  );
}

function ServersTab({ t }) {
  const { data, loading } = useLoad(() => api.servers(), []);
  if (loading && !data) return <div className="p2-empty"><Loader2 className="p2-spin" /></div>;
  const list = data?.servers || [];
  return (
    <div className="p2-card" style={{ padding: 12 }}>
      {list.length === 0 ? <div className="p2-empty">{t("plus2.admin.none")}</div> : (
        <table className="p2-table">
          <thead><tr><th>{t("plus2.manage.server")}</th><th className="r">{t("plus2.admin.boostCount")}</th><th className="r">{t("plus2.admin.boosters")}</th><th>{t("plus2.admin.level")}</th><th>{t("plus2.admin.goal")}</th></tr></thead>
          <tbody>{list.map((s) => (
            <tr key={s.id}><td><b>{s.name}</b></td><td className="r tnum">{s.count}</td><td className="r tnum">{s.boosters}</td><td><span className={`p2-pill ${s.level ? "is-ok" : ""}`}>{t("plus2.level.short", { level: s.level })}</span></td><td className="p2-small p2-muted">{s.goalLevel ? t("plus2.admin.goalLine", { level: s.goalLevel, date: s.goalDue || "-" }) : "-"}</td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

function GiftsTab({ t, locale }) {
  const { data, loading } = useLoad(() => api.gifts(), []);
  if (loading && !data) return <div className="p2-empty"><Loader2 className="p2-spin" /></div>;
  const list = data?.gifts || [];
  return (
    <div className="p2-card" style={{ padding: 12 }}>
      {list.length === 0 ? <div className="p2-empty">{t("plus2.admin.none")}</div> : (
        <table className="p2-table">
          <thead><tr><th>{t("plus2.admin.from")}</th><th>{t("plus2.manage.to")}</th><th>{t("plus2.manage.length")}</th><th className="r">{t("plus2.admin.amount")}</th><th>{t("plus2.manage.status")}</th><th>{t("plus2.admin.when")}</th></tr></thead>
          <tbody>{list.map((g) => {
            const chip = giftChip(g);
            return (
              <tr key={g.id}><td>{g.from?.displayName || g.from?.username}</td><td>{g.to?.displayName || g.to?.username}</td><td>{t("plus2.ck.months", { n: g.months })}{g.groupId ? ` · ${t("plus2.group.title")}` : ""}</td><td className="r tnum">{g.amountMinor != null ? formatPrice(g.amountMinor, g.currency || "TRY", locale) : "-"}</td><td><span className={`p2-pill is-${chip.tone === "muted" ? "" : chip.tone}`}>{t(`plus2.giftStatus.${chip.key}`)}</span></td><td className="p2-small p2-muted">{formatDate(g.deliverAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td></tr>
            );
          })}</tbody>
        </table>
      )}
    </div>
  );
}

function RefundsTab({ t, locale, onChanged }) {
  const { data, loading, reload } = useLoad(() => api.refunds(), []);
  const [busy, setBusy] = useState(null);
  if (loading && !data) return <div className="p2-empty"><Loader2 className="p2-spin" /></div>;
  const list = data?.refunds || [];
  const decide = async (id, decision) => {
    setBusy(id);
    try {
      await api.decide(id, { decision });
      reload();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="p2-card" style={{ padding: 12 }}>
      {list.length === 0 ? <div className="p2-empty">{t("plus2.admin.none")}</div> : (
        <table className="p2-table">
          <thead><tr><th>{t("plus2.admin.person")}</th><th className="r">{t("plus2.admin.amount")}</th><th>{t("plus2.admin.reason")}</th><th>{t("plus2.manage.status")}</th><th /></tr></thead>
          <tbody>{list.map((r) => (
            <tr key={r.id}>
              <td className="p2-row"><PAvatar user={r.user} size={24} />{r.user?.displayName || r.user?.username}</td>
              <td className="r tnum">{r.amount_minor != null ? formatPrice(r.amount_minor, r.currency || "TRY", locale) : "-"}</td>
              <td className="p2-small">{r.reason || "-"}</td>
              <td><span className={`p2-pill ${r.status === "approved" ? "is-ok" : r.status === "rejected" ? "is-danger" : "is-warn"}`}>{t(`plus2.admin.refundStatus.${r.status}`)}</span></td>
              <td className="r">{r.status === "pending" ? <span className="p2-row" style={{ justifyContent: "flex-end" }}><button type="button" className="p2-btn is-sm is-cta" disabled={busy === r.id} onClick={() => decide(r.id, "approve")}>{t("plus2.admin.approve")}</button><button type="button" className="p2-btn is-sm" disabled={busy === r.id} onClick={() => decide(r.id, "reject")}>{t("plus2.admin.reject")}</button></span> : null}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <div className="p2-note" style={{ marginTop: 10 }}><Users size={14} />{t("plus2.admin.refundNote")}</div>
    </div>
  );
}
