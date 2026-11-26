/**
 * Performans dialogs and the Uyarılar tab:
 *   PerfRuleDialog      "Uyarı kuralı": metrics, platforms, threshold, minimum samples,
 *                       channels, mute; right column = how often it would have fired in
 *                       the last 90 days (live, server-side replay of the rollups) and how
 *                       the message looks in the admin room
 *   PerfSaveViewDialog  name + shared, from the current tokens
 *   PerfFiltersDialog   every dimension as pills / inputs
 *   PerfAlertsTab       open + hidden regressions (undo), the rules in force
 *   SystemNote          live "Descall Sistem" admin-room message when a regression is found
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import GlassCheckbox from "../../ui/GlassCheckbox";
import { AuditDialog } from "../audit/AuditUi.jsx";
import { AlertTriangle, Bell, Bookmark, Bug, Check, Eye, Shield, SlidersHorizontal, Undo2, X } from "../../ui/Icon.jsx";
import logoIcon from "../../../assets/admin-logo-icon.png";
import { CONNECTIONS, DEVICES, LIST_KINDS, PLATFORMS, RANGES, fmtInt, fmtPct, fmtValue, queryToTokens, tokensToQuery } from "./perfAdminModel.js";

const RULE_METRICS = ["lcp", "inp", "cls", "fcp", "ttfb", "appstart", "voicejoin", "msglist"];
const CHANNELS = ["adminRoom", "ownerPush", "email", "errorLog"];

function errText(e, t) {
  const code = e?.code;
  if (code && t(`perfAdmin.err.${code}`) !== `perfAdmin.err.${code}`) return t(`perfAdmin.err.${code}`);
  return e?.message || t("perfAdmin.err.generic");
}

/* ---------------- rule dialog ---------------- */

export function PerfRuleDialog({ open, onClose, onSaved, t, locale, L, notify }) {
  const [rule, setRule] = useState(null);
  const [ruleId, setRuleId] = useState("new");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState({ loading: true, data: null, err: "" });
  const timer = useRef(null);

  useEffect(() => {
    if (!open) return;
    setErr("");
    setBusy(false);
    setRule(null);
    adminFetch("/perf/rules")
      .then((d) => {
        const r = (d.rules || [])[0] || {};
        setRuleId(d.isDefault || !r.id || r.id === "default" ? "new" : r.id);
        setRule({
          metrics: r.metrics || ["inp", "appstart"],
          platforms: r.platforms || ["ios", "android", "electron", "tauri"],
          thresholdPct: r.threshold_pct ?? 15,
          minSessions: r.min_sessions ?? 2000,
          channels: r.channels || ["adminRoom", "ownerPush", "errorLog"],
          mute: r.mute || "release24h",
        });
      })
      .catch((e) => {
        setRule({ metrics: ["inp", "appstart"], platforms: ["ios", "android", "electron", "tauri"], thresholdPct: 15, minSessions: 2000, channels: ["adminRoom", "ownerPush", "errorLog"], mute: "release24h" });
        setErr(errText(e, t));
      });
  }, [open, t]);

  const body = useMemo(() => (rule ? JSON.stringify(rule) : ""), [rule]);
  useEffect(() => {
    if (!open || !rule) return undefined;
    if (!rule.metrics.length || !rule.platforms.length || !(rule.thresholdPct >= 1) || !(rule.minSessions >= 10)) {
      setPreview({ loading: false, data: null, err: "" });
      return undefined;
    }
    setPreview((p) => ({ ...p, loading: true, err: "" }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      adminFetch("/perf/rules/preview", { method: "POST", body })
        .then((d) => setPreview({ loading: false, data: d, err: "" }))
        .catch((e) => setPreview({ loading: false, data: null, err: errText(e, t) }));
    }, 350);
    return () => clearTimeout(timer.current);
  }, [open, body, rule, t]);

  if (!open) return null;
  const toggle = (key, v) => setRule((r) => ({ ...r, [key]: r[key].includes(v) ? r[key].filter((x) => x !== v) : [...r[key], v] }));
  const invalid = !rule || !rule.metrics.length || !rule.platforms.length || !(rule.thresholdPct >= 1 && rule.thresholdPct <= 500) || !(rule.minSessions >= 10);

  const save = async () => {
    if (invalid) return;
    setBusy(true);
    setErr("");
    try {
      await adminFetch(`/perf/rules/${encodeURIComponent(ruleId)}`, { method: "PUT", body });
      notify(t("perfAdmin.rules.saved"));
      onSaved?.();
    } catch (e) {
      setErr(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const fires = preview.data?.fires || [];
  const sample = fires[0] || { version: "4.1.4", platform: "android", metric: rule?.metrics?.[0] || "inp", prevP75: 182, curP75: 268, deltaPct: 47, sessions: 31204 };
  const side = (
    <div className="alg-side-col apf-rule-side">
      <div className="apf-lab">{t("perfAdmin.rules.previewTitle")}</div>
      <div className="apf-box apf-prev-count" aria-live="polite" data-testid="perf-rule-preview">
        {preview.loading ? <span className="alg-skel" style={{ width: 40, height: 30 }} /> : <b className="tnum">{preview.data ? preview.data.count : "—"}</b>}
        <span>{preview.err || (preview.data ? (preview.data.count ? t("perfAdmin.rules.previewSome") : t("perfAdmin.rules.previewNone")) : t("perfAdmin.rules.previewInvalid"))}</span>
      </div>
      {fires.slice(0, 4).map((f) => (
        <div key={`${f.platform}-${f.metric}-${f.version}`} className="apf-chkrow">
          <span className={`apf-okic is-${f.deltaPct >= 30 ? "p" : "n"}`}>
            <AlertTriangle size={12} />
          </span>
          <span className="apf-nm">{t("perfAdmin.rules.fire", { version: f.version, platform: L.platform(f.platform), metric: L.metric(f.metric), pct: fmtPct(f.deltaPct, locale) })}</span>
          <small>{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${f.firstDay}T12:00:00Z`))}</small>
        </div>
      ))}
      <div className="apf-lab" style={{ marginTop: 8 }}>
        {t("perfAdmin.rules.roomTitle")}
      </div>
      <div className="apf-box apf-room">
        <span className="apf-room-logo">
          <img src={logoIcon} alt="" />
        </span>
        <div>
          <b>{t("perfAdmin.room.name")}</b> <span className="alg-chip is-blue">{t("perfAdmin.room.badge")}</span>{" "}
          <span className="alg-muted apf-room-time">{new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date())}</span>
          <p>
            {t("perfAdmin.room.text", {
              version: sample.version,
              platform: L.platform(sample.platform),
              metric: L.metric(sample.metric),
              from: fmtValue(sample.metric, sample.prevP75, locale, t),
              to: fmtValue(sample.metric, sample.curP75, locale, t),
              pct: fmtPct(sample.deltaPct, locale),
              n: fmtInt(sample.sessions, locale),
            })}{" "}
            <span className="apf-room-link">{t("perfAdmin.room.open")}</span>
          </p>
        </div>
      </div>
      {!rule?.channels?.includes("adminRoom") ? <p className="alg-small alg-muted">{t("perfAdmin.rules.roomOff")}</p> : null}
      <p className="alg-info apf-mt-auto">
        <Shield size={15} />
        {t("perfAdmin.rules.auditNote")}
      </p>
    </div>
  );

  return (
    <AuditDialog open={open} onClose={onClose} busy={busy} icon={Bell} tone="blue" title={t("perfAdmin.rules.title")} subtitle={t("perfAdmin.rules.subtitle")} side={side} sideWidth={380} width={560} testId="perf-rule-dialog">
      {!rule ? (
        <span className="alg-skel" style={{ height: 260 }} />
      ) : (
        <>
          <div>
            <div className="alg-lab">{t("perfAdmin.rules.metric")}</div>
            <div className="alg-pills">
              {RULE_METRICS.map((m) => (
                <button key={m} type="button" className={`alg-pill${rule.metrics.includes(m) ? " is-on" : ""}`} aria-pressed={rule.metrics.includes(m)} onClick={() => toggle("metrics", m)} data-testid={`perf-rule-metric-${m}`}>
                  {L.metric(m)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="alg-lab">{t("perfAdmin.rules.platform")}</div>
            <div className="alg-pills">
              {PLATFORMS.map((p) => (
                <button key={p.k} type="button" className={`alg-pill apf-pill-dot${rule.platforms.includes(p.k) ? " is-on" : ""}`} aria-pressed={rule.platforms.includes(p.k)} onClick={() => toggle("platforms", p.k)}>
                  <i style={{ background: p.c }} />
                  {L.platform(p.k)}
                </button>
              ))}
            </div>
          </div>
          <label className="alg-field">
            <span className="alg-lab">{t("perfAdmin.rules.condition")}</span>
            <span className="alg-inp apf-static">{t("perfAdmin.rules.conditionText")}</span>
          </label>
          <div className="alg-row-2">
            <label className="alg-field">
              <span className="alg-lab">{t("perfAdmin.rules.threshold")}</span>
              <span className="apf-inp-unit">
                <input className="alg-inp tnum" type="number" min={1} max={500} value={rule.thresholdPct} onChange={(e) => setRule((r) => ({ ...r, thresholdPct: Number(e.target.value) }))} data-testid="perf-rule-threshold" />
                <em>{t("perfAdmin.rules.thresholdUnit")}</em>
              </span>
            </label>
            <label className="alg-field">
              <span className="alg-lab">{t("perfAdmin.rules.minSessions")}</span>
              <span className="apf-inp-unit">
                <input className="alg-inp tnum" type="number" min={10} step={100} value={rule.minSessions} onChange={(e) => setRule((r) => ({ ...r, minSessions: Number(e.target.value) }))} data-testid="perf-rule-min" />
                <em>{t("perfAdmin.rules.minUnit")}</em>
              </span>
            </label>
          </div>
          <div>
            <div className="alg-lab">{t("perfAdmin.rules.notify")}</div>
            <div className="apf-checks">
              {CHANNELS.map((c) => (
                <label key={c} className="alg-check">
                  <GlassCheckbox checked={rule.channels.includes(c)} onChange={() => toggle("channels", c)} />
                  <span>{t(`perfAdmin.rules.ch.${c}`)}</span>
                  <small className="apf-ml">{t(`perfAdmin.rules.chSub.${c}`)}</small>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="alg-lab">{t("perfAdmin.rules.mute")}</div>
            <div className="alg-pills">
              {["none", "release24h", "7d"].map((m) => (
                <button key={m} type="button" className={`alg-pill${rule.mute === m ? " is-on" : ""}`} aria-pressed={rule.mute === m} onClick={() => setRule((r) => ({ ...r, mute: m }))}>
                  {t(`perfAdmin.rules.muteOpt.${m}`)}
                </button>
              ))}
            </div>
          </div>
          {err ? <p className="alg-err">{err}</p> : null}
          <div className="alg-row alg-row-end">
            <button type="button" className="alg-btn is-ghost" onClick={onClose} disabled={busy}>
              {t("perfAdmin.cancel")}
            </button>
            <button type="button" className="alg-btn is-brand" onClick={save} disabled={busy || invalid} data-testid="perf-rule-save">
              <Check size={18} />
              {busy ? t("perfAdmin.saving") : t("perfAdmin.rules.save")}
            </button>
          </div>
        </>
      )}
    </AuditDialog>
  );
}

/* ---------------- save view ---------------- */

export function PerfSaveViewDialog({ open, tokens, tokenText, query, tab = "rum", onClose, onSaved, t }) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    setName("");
    setShared(true);
    setErr("");
    setBusy(false);
  }, [open]);
  if (!open) return null;
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const r = await adminFetch("/perf/views", { method: "POST", body: JSON.stringify({ name: name.trim(), query, shared, tab }) });
      onSaved(r.view);
    } catch (e) {
      setErr(errText(e, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuditDialog open={open} onClose={onClose} busy={busy} icon={Bookmark} tone="blue" title={t("perfAdmin.views.saveTitle")} subtitle={t("perfAdmin.views.saveSubtitle")} width={480} testId="perf-save-view">
      <label className="alg-field">
        <span className="alg-lab">{t("perfAdmin.views.name")}</span>
        <input
          className="alg-inp"
          value={name}
          maxLength={60}
          placeholder={t("perfAdmin.views.namePh")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          data-autofocus
          data-testid="perf-save-view-name"
        />
      </label>
      <div>
        <div className="alg-lab">{t("perfAdmin.views.contains")}</div>
        <div className="alg-tokrow">
          {tokens.map((tok, i) => {
            const tx = tokenText(tok);
            return (
              <span key={i} className="alg-tok is-static">
                <b>{tx.k}</b>
                <span className="alg-tok-v">{tx.v}</span>
              </span>
            );
          })}
        </div>
      </div>
      <label className="alg-check">
        <GlassCheckbox checked={shared} onChange={(e) => setShared(e.target.checked)} />
        <span>
          {t("perfAdmin.views.shared")}
          <small>{t("perfAdmin.views.sharedSub")}</small>
        </span>
      </label>
      {err ? <p className="alg-err">{err}</p> : null}
      <div className="alg-row">
        <button type="button" className="alg-btn is-ghost" onClick={onClose} disabled={busy}>
          {t("perfAdmin.cancel")}
        </button>
        <button type="button" className="alg-btn is-brand" onClick={submit} disabled={busy || !name.trim()} data-testid="perf-save-view-submit">
          {busy ? t("perfAdmin.saving") : t("perfAdmin.save")}
        </button>
      </div>
    </AuditDialog>
  );
}

/* ---------------- filters ---------------- */

export function PerfFiltersDialog({ open, tokens, facets, L, t, onClose, onApply }) {
  const [q, setQ] = useState(() => tokensToQuery(tokens));
  useEffect(() => {
    if (open) setQ(tokensToQuery(tokens));
  }, [open, tokens]);
  if (!open) return null;
  const toggle = (k, v) => setQ((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const pills = (k, values, label) => (
    <div className="alg-pills">
      {values.map((v) => (
        <button key={v} type="button" className={`alg-pill${q[k].includes(v) ? " is-on" : ""}`} aria-pressed={q[k].includes(v)} onClick={() => toggle(k, v)}>
          {label(v)}
        </button>
      ))}
    </div>
  );
  return (
    <AuditDialog open={open} onClose={onClose} icon={SlidersHorizontal} tone="blue" title={t("perfAdmin.filters.title")} subtitle={t("perfAdmin.filters.subtitle")} width={620} testId="perf-filters">
      <div>
        <div className="alg-lab">{t("perfAdmin.tok.range")}</div>
        <div className="alg-pills">
          {RANGES.map((r) => (
            <button key={r} type="button" className={`alg-pill${q.range === r ? " is-on" : ""}`} aria-pressed={q.range === r} onClick={() => setQ((x) => ({ ...x, range: r }))}>
              {L.range(r)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="alg-lab">{t("perfAdmin.tok.platform")}</div>
        {pills("platform", PLATFORMS.map((p) => p.k), L.platform)}
      </div>
      {facets.version?.length ? (
        <div>
          <div className="alg-lab">{t("perfAdmin.tok.version")}</div>
          {pills("version", facets.version.slice(0, 10), (v) => v)}
        </div>
      ) : null}
      {facets.route?.length ? (
        <div>
          <div className="alg-lab">{t("perfAdmin.tok.route")}</div>
          {pills("route", facets.route.slice(0, 16), (v) => v)}
        </div>
      ) : null}
      <div className="alg-row-2">
        <div>
          <div className="alg-lab">{t("perfAdmin.tok.device")}</div>
          {pills("device", DEVICES, L.device)}
        </div>
        <div>
          <div className="alg-lab">{t("perfAdmin.tok.connection")}</div>
          {pills("connection", CONNECTIONS, L.connection)}
        </div>
      </div>
      {facets.country?.length ? (
        <div>
          <div className="alg-lab">{t("perfAdmin.tok.country")}</div>
          {pills("country", facets.country.slice(0, 16), L.country)}
        </div>
      ) : null}
      <label className="alg-field">
        <span className="alg-lab">{t("perfAdmin.tok.user")}</span>
        <input className="alg-inp apf-mono" value={q.user} placeholder={t("perfAdmin.filters.userPh")} onChange={(e) => setQ((x) => ({ ...x, user: e.target.value.trim().replace(/^#/, "").toLowerCase() }))} />
      </label>
      <div className="alg-row">
        <button type="button" className="alg-btn is-ghost" onClick={() => setQ(tokensToQuery([{ kind: "range", value: q.range }]))}>
          {t("perfAdmin.filters.clear")}
        </button>
        <button type="button" className="alg-btn is-brand" onClick={() => onApply(queryToTokens({ ...q, ...Object.fromEntries(LIST_KINDS.map((k) => [k, q[k]])) }))} data-testid="perf-filters-apply">
          {t("perfAdmin.filters.apply")}
        </button>
      </div>
    </AuditDialog>
  );
}

/* ---------------- Uyarılar tab ---------------- */

export function PerfAlertsTab({ t, locale, L, open, hidden, busy, onReview, onErrorLog, onHide, onShow, onRules }) {
  const row = (a, isHidden) => (
    <div key={a.id} className={`apf-alert${isHidden ? " is-hidden" : ""}`} data-testid={`perf-alert-${a.id}`}>
      <span className={`alg-anom-ic${isHidden ? " is-amber" : ""}`} aria-hidden="true">
        <AlertTriangle size={18} />
      </span>
      <div className="apf-alert-t">
        <b>
          {t("perfAdmin.alert.lead", {
            version: a.version,
            platform: L.platform(a.platform),
            metric: L.metric(a.metric),
            from: fmtValue(a.metric, a.prevP75, locale, t),
            to: fmtValue(a.metric, a.curP75, locale, t),
            pct: fmtPct(a.deltaPct, locale),
          })}
        </b>
        <small>
          {t("perfAdmin.alert.sessions", { n: fmtInt(a.sessions, locale) })} · {t("perfAdmin.alert.vsPrev", { version: a.prevVersion || "—" })} ·{" "}
          {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(a.at))}
          {a.errorLogId ? ` · ${t("perfAdmin.alert.hasError")}` : ""}
        </small>
      </div>
      {isHidden ? (
        <button type="button" className="alg-btn is-ghost" onClick={() => onShow(a)} disabled={busy === `hide-${a.id}`}>
          <Undo2 size={16} />
          {t("perfAdmin.alert.show")}
        </button>
      ) : (
        <>
          <button type="button" className="alg-btn is-red" onClick={() => onReview(a)}>
            <Eye size={16} />
            {t("perfAdmin.alert.review")}
          </button>
          <button type="button" className="alg-btn is-ghost" onClick={() => onErrorLog(a)} disabled={busy === `err-${a.id}`}>
            <Bug size={16} />
            {a.errorLogId ? t("perfAdmin.alert.errorAgain") : t("perfAdmin.alert.errorLog")}
          </button>
          <button type="button" className="alg-btn is-ghost" onClick={() => onHide(a)} disabled={busy === `hide-${a.id}`}>
            {t("perfAdmin.alert.hide")}
          </button>
        </>
      )}
    </div>
  );
  return (
    <div className="apf-alerts" data-testid="perf-alerts">
      <section className="alg-card">
        <h3>
          <Bell size={18} />
          <span>{t("perfAdmin.alerts.open")}</span>
          <button type="button" className="alg-x apf-link-btn" onClick={onRules}>
            {t("perfAdmin.rules.button")}
          </button>
        </h3>
        {!open.length ? <p className="alg-empty-s">{t("perfAdmin.alerts.none")}</p> : open.map((a) => (row(a, false)))}
      </section>
      {hidden.length ? (
        <section className="alg-card">
          <h3>
            <X size={18} />
            <span>{t("perfAdmin.alerts.hidden")}</span>
          </h3>
          {hidden.map((a) => (row(a, true)))}
        </section>
      ) : null}
      <p className="alg-info">
        <Shield size={15} />
        {t("perfAdmin.alerts.how")}
      </p>
    </div>
  );
}

/* ---------------- live system message ---------------- */

export function SystemNote({ note, t, locale, L, onOpen, onClose }) {
  useEffect(() => {
    const id = setTimeout(onClose, 30000);
    return () => clearTimeout(id);
  }, [note, onClose]);
  return (
    <div className="apf-note" role="status" aria-live="polite" data-testid="perf-system-note">
      <span className="apf-room-logo">
        <img src={logoIcon} alt="" />
      </span>
      <div>
        <b>{t("perfAdmin.room.name")}</b> <span className="alg-chip is-blue">{t("perfAdmin.room.badge")}</span>{" "}
        <span className="alg-muted apf-room-time">{new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(note.at))}</span>
        <p>
          {t("perfAdmin.room.text", {
            version: note.version,
            platform: L.platform(note.platform),
            metric: L.metric(note.metric),
            from: fmtValue(note.metric, note.prevP75, locale, t),
            to: fmtValue(note.metric, note.curP75, locale, t),
            pct: fmtPct(note.deltaPct, locale),
            n: fmtInt(note.sessions, locale),
          })}{" "}
          <button type="button" className="apf-room-link" onClick={onOpen}>
            {t("perfAdmin.room.open")}
          </button>
        </p>
      </div>
      <button type="button" className="alg-mbtn" aria-label={t("perfAdmin.close")} onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}
