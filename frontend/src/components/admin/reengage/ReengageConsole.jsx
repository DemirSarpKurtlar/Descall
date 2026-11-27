import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT, useLocale } from "../../../context/LocaleContext";
import {
  Search,
  Send,
  Pause,
  Play,
  Zap,
  User,
  Clock,
  Bell,
  Moon,
  Mail,
  Flame,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Check,
  X,
  Eye,
} from "../../ui/Icon.jsx";
import { reengageAdmin } from "../../../api/reengage";
import LiveWaveWindow from "./LiveWaveWindow.jsx";
import FriendCallPanel from "./FriendCallPanel.jsx";
import { LANG_ROWS, PLACEHOLDERS, campaignSub, rateLabel, openRateTone, splitTokens, excludedRows, hourBars, todayLine } from "./reengageModel.js";
import { useModalFocusRef } from "../../../hooks/useModalFocus.js";
import GlassCheckbox from "../../ui/GlassCheckbox.jsx";
import "../../../styles/reengage.css";

/** The app name as iOS prints it on a notification (same in every language). */
const APP_LABEL = "DESCALL";

const ICON = { user: User, clock: Clock, bell: Bell, moon: Moon, mail: Mail, flame: Flame };
const FILTERS = ["all", "live", "draft", "auto"];
const TABS = ["message", "audience", "limits", "results", "log"];

/** Reason + confirm (every destructive or sending change asks for a written reason). */
export function ReasonDialog({ title, body, confirmLabel, danger = false, needReason = true, number = null, onConfirm, onClose, t }) {
  const [reason, setReason] = useState("");
  const [num, setNum] = useState(number ? number.value : 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef(null);
  const trapRef = useModalFocusRef();
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      await onConfirm(reason.trim(), num);
      onClose();
    } catch (e) {
      setErr(e?.message || t("rg3.errors.save"));
      setBusy(false);
    }
  };
  return (
    <div className="rg-modal-wrap" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="rg-modal" ref={trapRef}>
        <b className="rg-modal-h">{title}</b>
        {body ? <p className="rg-pop-sub">{body}</p> : null}
        {number ? (
          <label className="rg-field">
            <span>{number.label}</span>
            <input type="number" min={number.min} max={number.max} value={num} onChange={(e) => setNum(Math.max(number.min, Math.min(number.max, Math.round(Number(e.target.value) || 0))))} />
          </label>
        ) : null}
        {needReason ? (
          <label className="rg-field">
            <span>{t("rg3.admin.reason")}</span>
            <textarea ref={ref} rows={2} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder={t("rg3.admin.reasonPh")} />
          </label>
        ) : null}
        {err ? (
          <p className="rg-err" role="alert">
            <AlertTriangle size={13} /> {err}
          </p>
        ) : null}
        <div className="rg-pop-actions">
          <button type="button" className="rg-btn ghost" onClick={onClose} disabled={busy}>
            {t("rg3.common.cancel")}
          </button>
          <button type="button" className={`rg-btn ${danger ? "danger" : "primary"}`} onClick={go} disabled={busy || (needReason && reason.trim().length < 3)}>
            {busy ? <Loader2 size={14} className="rg-spin" /> : null} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeSwitch({ mode, paused, onChange, t }) {
  const opts = [
    { id: "off", label: t("rg3.admin.modeOff") },
    { id: "dry_run", label: t("rg3.admin.modeDry") },
    { id: "live", label: t("rg3.admin.modeLive") },
  ];
  return (
    <div className="rg-mode" role="radiogroup" aria-label={t("rg3.admin.mode")}>
      <span className="lbl">{t("rg3.admin.mode")}</span>
      {opts.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={mode === o.id} className={`${mode === o.id ? "on" : ""} m-${o.id}`} onClick={() => mode !== o.id && onChange(o.id)}>
          {o.label}
        </button>
      ))}
      {paused ? <span className="rg-chip red">{t("rg3.admin.paused")}</span> : null}
    </div>
  );
}

function Kpi({ label, value, tone }) {
  return (
    <div className={`rg-kpi${tone ? ` ${tone}` : ""}`}>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}

function TokenText({ text }) {
  return (
    <span className="rg-tokens">
      {splitTokens(text).map((part, i) =>
        part.token ? (
          <code key={i} className={part.known ? "" : "bad"}>
            {`{${part.text}}`}
          </code>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}

function Editor({ campaign, lang, onSave, t }) {
  const tpl = campaign.templates[lang];
  const [draft, setDraft] = useState(tpl);
  const [focus, setFocus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const refs = useRef({});
  useEffect(() => {
    setDraft(campaign.templates[lang]);
    setErr("");
  }, [campaign, lang]);
  const dirty = ["pushTitle", "pushBody", "emailSubject", "emailBody"].some((k) => (draft[k] || "") !== (tpl[k] || ""));
  const fields = [
    ["pushTitle", "rg3.admin.fPushTitle", 80],
    ["pushBody", "rg3.admin.fPushBody", 180],
    ["emailSubject", "rg3.admin.fEmailSubject", 120],
    ["emailBody", "rg3.admin.fEmailBody", 1200],
  ].filter(([k]) => k.startsWith("push") ? campaign.channels.includes("push") : campaign.channels.includes("email"));
  const insert = (name) => {
    const k = focus || fields[0][0];
    const el = refs.current[k];
    const v = draft[k] || "";
    const at = el ? el.selectionStart : v.length;
    setDraft({ ...draft, [k]: `${v.slice(0, at)}{${name}}${v.slice(at)}` });
  };
  const save = async (approve) => {
    setBusy(true);
    setErr("");
    try {
      const template = {};
      if (dirty) for (const [k] of fields) template[k] = draft[k] || "";
      if (approve) template.approved = true;
      await onSave(lang, template);
    } catch (e) {
      setErr(e?.code === "unknown_placeholder" ? t("rg3.admin.badPlaceholder") : e?.message || t("rg3.errors.save"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rg-editor">
      {fields.map(([k, label, max]) => (
        <label key={k} className="rg-field">
          <span>{t(label)}</span>
          {focus === k ? (
            k === "emailBody" ? (
              <textarea ref={(el) => (refs.current[k] = el)} rows={3} maxLength={max} value={draft[k] || ""} autoFocus onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
            ) : (
              <input ref={(el) => (refs.current[k] = el)} maxLength={max} value={draft[k] || ""} autoFocus onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
            )
          ) : (
            // The draft shows the fields as text with {placeholder} chips; a tap edits it.
            <button type="button" className="rg-tokenbox" onClick={() => setFocus(k)} aria-label={t(label)}>
              <TokenText text={draft[k] || ""} />
            </button>
          )}
        </label>
      ))}
      <div className="rg-tokbar">
        {PLACEHOLDERS.map((p) => (
          <button key={p} type="button" onClick={() => insert(p)}>
            {`{${p}}`}
          </button>
        ))}
      </div>
      {err ? (
        <p className="rg-err" role="alert">
          <AlertTriangle size={13} /> {err}
        </p>
      ) : null}
      <div className="rg-editor-actions">
        {!tpl.approved && !dirty ? <span className="rg-chip gold">{t("rg3.admin.inReview")}</span> : null}
        {dirty ? (
          <button type="button" className="rg-btn" disabled={busy} onClick={() => save(false)}>
            {t("rg3.admin.saveDraft")}
          </button>
        ) : null}
        <button type="button" className="rg-btn primary" disabled={busy || (!dirty && tpl.approved)} onClick={() => save(true)}>
          {busy ? <Loader2 size={14} className="rg-spin" /> : <Check size={14} />} {dirty ? t("rg3.admin.saveApprove") : t("rg3.admin.approve")}
        </button>
      </div>
    </div>
  );
}

function UserPreview({ campaignId, lang, setLang, t, locale }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    setErr(false);
    reengageAdmin
      .preview(campaignId, { lang })
      .then((r) => alive && setP(r))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [campaignId, lang]);
  const now = new Date();
  const best = p?.sample?.bestHour;
  const shown = best != null ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), best, 30) : now;
  return (
    <aside className="rg-userprev" aria-label={t("rg3.admin.userSees")}>
      <div className="rg-card-h">
        <b>{t("rg3.admin.userSees")}</b>
        <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t("rg3.admin.language")}>
          {LANG_ROWS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      {err ? <p className="rg-err">{t("rg3.errors.load")}</p> : null}
      {p?.sample ? (
        <div className="rg-sample">
          <span className="rg-sample-av">{(p.sample.name || "?")[0]}</span>
          <div>
            <b>{p.sample.absentDays != null ? t("rg3.admin.sampleAway", { name: p.sample.name, days: p.sample.absentDays }) : p.sample.name}</b>
            <small>
              {[p.sample.timezone?.split("/").pop()?.replace(/_/g, " "), p.sample.device, best != null ? t("rg3.admin.bestHourAt", { time: `${String(best).padStart(2, "0")}:30` }) : null].filter(Boolean).join(" · ")}
            </small>
          </div>
        </div>
      ) : p ? (
        <p className="rg-empty sm">{t("rg3.admin.sampleNone")}</p>
      ) : null}
      {p ? (
        <>
          {p.push?.title ? (
            <div className="rg-lock big">
              <div className="rg-lock-date">{new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(shown)}</div>
              <div className="rg-lock-time">{new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(shown)}</div>
              <div className="rg-notif">
                <div className="rg-notif-h">
                  <span className="rg-app" aria-hidden="true" />
                  <span>{APP_LABEL}</span>
                  <span className="rg-notif-time">{t("rg3.preview.now")}</span>
                </div>
                <div className="rg-notif-b">
                  <span className="rg-stack">
                    {(p.push.faces || []).slice(0, 2).map((f, i) => (
                      <span key={i} className="rg-mini-face">
                        {(f.name || "?")[0]}
                      </span>
                    ))}
                  </span>
                  <div className="rg-notif-tx">
                    <b>{p.push.title}</b>
                    <small>{p.push.body}</small>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {p.email?.subject ? (
            <div className="rg-mailprev">
              <small className="rg-mailprev-k">{t("rg3.admin.inbox")}</small>
              <b>{p.email.subject}</b>
              <div className="rg-mailprev-card">
                <span className="eb">{APP_LABEL}</span>
                <b>{t("rg3.admin.mailEyebrow")}</b>
              </div>
              <p>{p.email.body}</p>
              <span className="rg-btn primary sm">{t("rg3.admin.openApp")}</span>
            </div>
          ) : null}
          {p.fallback ? <p className="rg-foot">{t("rg3.admin.fallbackNote")}</p> : null}
        </>
      ) : (
        <div className="rg-skel tall" />
      )}
    </aside>
  );
}

function HoursChart({ hours, t }) {
  const bars = hourBars(hours);
  return (
    <div className="rg-hours" role="img" aria-label={t("rg3.admin.bestHours")}>
      <div className="rg-hours-plot">
        {bars.map((b) => (
          <i key={b.hour} className={`${b.quiet ? "q" : ""}${b.top ? " top" : ""}`} style={{ height: `${Math.max(4, b.pct)}%` }} title={`${String(b.hour).padStart(2, "0")}:00 · ${b.value}`} />
        ))}
      </div>
      <div className="rg-hours-ax">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}

export default function ReengageConsole({ isOwner = false }) {
  const t = useT();
  const { locale } = useLocale();
  const [ov, setOv] = useState(null);
  const [ovErr, setOvErr] = useState("");
  const [selId, setSelId] = useState("inactive7");
  const [ws, setWs] = useState(null);
  const [wsErr, setWsErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("message");
  const [lang, setLang] = useState("tr");
  const [prevLang, setPrevLang] = useState("tr");
  const [dialog, setDialog] = useState(null);
  const [live, setLive] = useState(null); // { waveId, minimized }
  const [toast, setToast] = useState(null);
  const [nonce, setNonce] = useState(0);

  const loadOverview = useCallback(() => {
    reengageAdmin
      .overview()
      .then((r) => {
        setOv(r);
        setOvErr("");
      })
      .catch((e) => setOvErr(e?.code === "not_ready" ? t("rg3.errors.notReady") : t("rg3.errors.load")));
  }, [t]);
  useEffect(() => loadOverview(), [loadOverview, nonce]);
  useEffect(() => {
    let alive = true;
    setWs(null);
    setWsErr("");
    reengageAdmin
      .workspace(selId)
      .then((r) => alive && setWs(r))
      .catch(() => alive && setWsErr(t("rg3.errors.load")));
    return () => {
      alive = false;
    };
  }, [selId, nonce, t]);

  const flash = (text, kind = "ok") => {
    setToast({ text, kind });
    window.setTimeout(() => setToast((x) => (x?.text === text ? null : x)), 4000);
  };

  const list = useMemo(() => {
    const all = ov?.campaigns || [];
    const fq = q.trim().toLocaleLowerCase("tr");
    return all.filter((c) => (filter === "all" ? true : filter === "live" ? c.status === "live" : c.status === filter)).filter((c) => !fq || t(`rg3.campaigns.${c.id}.name`).toLocaleLowerCase("tr").includes(fq));
  }, [ov, filter, q, t]);
  const counts = useMemo(() => {
    const all = ov?.campaigns || [];
    return { all: all.length, live: all.filter((c) => c.status === "live").length, draft: all.filter((c) => c.status === "draft").length, auto: all.filter((c) => c.status === "auto").length };
  }, [ov]);

  const mode = ov?.mode?.mode || "off";
  const paused = Boolean(ov?.mode?.paused);
  const c = ws?.campaign;

  const changeMode = (next) =>
    setDialog({
      title: t("rg3.admin.modeConfirm", { mode: t(next === "live" ? "rg3.admin.modeLive" : next === "dry_run" ? "rg3.admin.modeDry" : "rg3.admin.modeOff") }),
      body: next === "live" ? t("rg3.admin.modeLiveBody") : t("rg3.admin.modeBody"),
      confirmLabel: t("rg3.admin.modeApply"),
      danger: next === "live",
      onConfirm: async (reason) => {
        await reengageAdmin.settings({ modeOverride: next, reason });
        setNonce((n) => n + 1);
        flash(t("rg3.admin.modeSaved"));
      },
    });

  const togglePauseAll = () =>
    setDialog({
      title: paused ? t("rg3.admin.resumeAll") : t("rg3.admin.pauseAll"),
      body: paused ? t("rg3.admin.resumeBody") : t("rg3.admin.pauseBody"),
      confirmLabel: paused ? t("rg3.admin.resumeAll") : t("rg3.admin.pauseAll"),
      danger: !paused,
      needReason: !paused,
      onConfirm: async (reason) => {
        await reengageAdmin.settings({ paused: !paused, reason });
        setNonce((n) => n + 1);
      },
    });

  const setStatus = (status) =>
    setDialog({
      title: t(status === "paused" ? "rg3.admin.pauseOne" : "rg3.admin.resumeOne", { name: t(`rg3.campaigns.${c.id}.name`) }),
      confirmLabel: t(status === "paused" ? "rg3.admin.pause" : "rg3.admin.resume"),
      danger: status === "paused",
      onConfirm: async (reason) => {
        await reengageAdmin.save(c.id, { status, reason });
        setNonce((n) => n + 1);
      },
    });

  const sendNow = () =>
    setDialog({
      title: t("rg3.admin.sendTitle", { name: t(`rg3.campaigns.${c.id}.name`) }),
      body: t("rg3.admin.sendBody", { count: ws?.stats?.reachableNow ?? 0 }),
      confirmLabel: t("rg3.admin.sendNow"),
      needReason: false,
      onConfirm: async () => {
        const r = await reengageAdmin.sendNow(c.id);
        if (r?.wave?.id) setLive({ waveId: r.wave.id, minimized: false });
      },
    });

  const test = async () => {
    try {
      const r = await reengageAdmin.test(c.id);
      flash(r.ok ? t("rg3.admin.testSent") : t("rg3.admin.testNone"), r.ok ? "ok" : "err");
    } catch {
      flash(t("rg3.errors.save"), "err");
    }
  };

  const saveTemplate = async (l, template) => {
    const r = await reengageAdmin.save(c.id, { lang: l, template });
    setWs((w) => ({ ...w, campaign: r.campaign }));
    flash(template.approved ? t("rg3.admin.approved") : t("rg3.admin.saved"));
  };

  return (
    <div className="rg-console">
      <header className="rg-console-h">
        <div>
          <h2>{t("rg3.admin.title")}</h2>
          <p>{ov ? todayLine(ov, t) : ovErr || t("rg3.common.loading")}</p>
        </div>
        <div className="rg-console-actions">
          {isOwner ? <ModeSwitch mode={mode} paused={paused} onChange={changeMode} t={t} /> : <span className="rg-chip">{t(`rg3.admin.modeIs_${mode}`)}</span>}
          <button type="button" className={`rg-btn ${paused ? "" : "danger-soft"}`} onClick={togglePauseAll}>
            {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? t("rg3.admin.resumeAll") : t("rg3.admin.pauseAll")}
          </button>
          <button type="button" className="rg-icon-btn" onClick={() => setNonce((n) => n + 1)} aria-label={t("rg3.common.refresh")}>
            <RefreshCw size={15} />
          </button>
        </div>
      </header>
      {ov?.mode && ov.mode.envMode !== ov.mode.mode ? <p className="rg-note">{t("rg3.admin.envNote", { env: t(`rg3.admin.modeIs_${ov.mode.envMode}`) })}</p> : null}
      {toast ? <p className={toast.kind === "ok" ? "rg-ok" : "rg-err"} role="status">{toast.text}</p> : null}
      <div className="rg-bws">
        <nav className="rg-card rg-clist" aria-label={t("rg3.admin.campaigns")}>
          <label className="rg-search">
            <Search size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("rg3.admin.search")} aria-label={t("rg3.admin.search")} />
          </label>
          <div className="rg-filters">
            {FILTERS.map((f) => (
              <button key={f} type="button" className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {t(`rg3.admin.filter_${f}`)} {counts[f]}
              </button>
            ))}
          </div>
          {!ov && !ovErr ? <div className="rg-skel tall" /> : null}
          {list.map((x) => {
            const Ic = ICON[x.icon] || Bell;
            return (
              <button key={x.id} type="button" className={`rg-crow${selId === x.id ? " on" : ""}`} onClick={() => setSelId(x.id)} aria-pressed={selId === x.id}>
                <span className={`rg-cic s-${x.status}`}>
                  <Ic size={15} />
                </span>
                <span className="tx">
                  <b>
                    {t(`rg3.campaigns.${x.id}.name`)}
                    {x.status === "live" ? <i className="rg-livedot" aria-label={t("rg3.admin.live")} /> : x.status === "draft" ? <em className="rg-tag">{t("rg3.admin.draft")}</em> : x.status === "paused" ? <em className="rg-tag red">{t("rg3.admin.pausedTag")}</em> : null}
                  </b>
                  <small>{campaignSub(x, t)}</small>
                  <span className="rg-bar" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, x.returnRate || x.openRate || 0)}%` }} />
                  </span>
                </span>
                <span className="rt">
                  <b>{x.audience ?? "—"}</b>
                  <small>{rateLabel(x, t)}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <section className="rg-card rg-ws" aria-live="polite">
          {wsErr ? (
            <div className="rg-state-card" role="alert">
              <AlertTriangle size={18} />
              <div>
                <b>{wsErr}</b>
              </div>
              <button type="button" className="rg-btn" onClick={() => setNonce((n) => n + 1)}>
                <RefreshCw size={14} /> {t("rg3.common.retry")}
              </button>
            </div>
          ) : !c ? (
            <div className="rg-skel tall" />
          ) : (
            <>
              <div className="rg-ws-h">
                <span className={`rg-cic big s-${c.status}`}>{(() => { const Ic = ICON[c.icon] || Bell; return <Ic size={18} />; })()}</span>
                <div className="tx">
                  <b>
                    {t(`rg3.campaigns.${c.id}.name`)} <span className={`rg-status s-${c.status}`}>{t(`rg3.admin.status_${c.status}`)}</span>
                  </b>
                  <small>{t(`rg3.campaigns.${c.id}.desc`)}</small>
                </div>
              </div>
              {c.id === "friend_call" ? (
                <FriendCallPanel t={t} locale={locale} isOwner={isOwner} onDialog={setDialog} />
              ) : (
                <>
                  <div className="rg-ws-actions">
                    <div className="rg-btn-group">
                      {c.status === "paused" || c.status === "draft" ? (
                        <button type="button" className="rg-btn" onClick={() => setStatus("live")}>
                          <Play size={14} /> {c.status === "draft" ? t("rg3.admin.goLive") : t("rg3.admin.resume")}
                        </button>
                      ) : (
                        <button type="button" className="rg-btn" onClick={() => setStatus("paused")}>
                          <Pause size={14} /> {t("rg3.admin.pause")}
                        </button>
                      )}
                      <button type="button" className="rg-btn" onClick={test}>
                        <Zap size={14} /> {t("rg3.admin.test")}
                      </button>
                    </div>
                    <button type="button" className="rg-btn primary" onClick={sendNow} disabled={mode === "off" || paused}>
                      <Send size={14} /> {t("rg3.admin.sendNow")}
                    </button>
                  </div>
                  {mode === "off" || paused ? <p className="rg-note">{paused ? t("rg3.admin.pausedNote") : t("rg3.admin.offNote")}</p> : null}
                  <div className="rg-kpis">
                    <Kpi label={t("rg3.admin.kAudience")} value={ws.stats.audience ?? "—"} />
                    <Kpi label={t("rg3.admin.kReachable")} value={ws.stats.reachable ?? "—"} />
                    <Kpi label={t("rg3.admin.kSentWeek")} value={ws.stats.sentWeek ?? 0} />
                    <Kpi label={t("rg3.admin.kReturned")} value={ws.stats.return48 != null ? `%${ws.stats.return48}` : "—"} tone="green" />
                    {ws.stats.sourceCall != null ? <Kpi label={t("rg3.admin.kSource")} value={`%${ws.stats.sourceCall}`} /> : <Kpi label={t("rg3.admin.kNet")} value={ws.stats.net != null ? `${ws.stats.net > 0 ? "+" : ""}${ws.stats.net}` : "—"} />}
                  </div>
                  <div className="rg-tabs" role="tablist">
                    {TABS.map((x) => (
                      <button key={x} type="button" role="tab" aria-selected={tab === x} className={tab === x ? "on" : ""} onClick={() => setTab(x)}>
                        {t(`rg3.admin.tab_${x}`)}
                        {x === "audience" ? <span className="n">{ws.stats.reachable ?? 0}</span> : x === "log" ? <span className="n">{(ws.log || []).length + (ws.waves || []).length}</span> : null}
                      </button>
                    ))}
                  </div>
                  {tab === "message" ? (
                    <div className="rg-msgtab">
                      <div className="rg-langs" role="listbox" aria-label={t("rg3.admin.language")}>
                        {ws.languages.map((l) => {
                          const row = LANG_ROWS.find((x) => x.id === l.lang);
                          return (
                            <button key={l.lang} type="button" role="option" aria-selected={lang === l.lang} className={`rg-lrow${lang === l.lang ? " on" : ""}`} onClick={() => { setLang(l.lang); setPrevLang(l.lang); }}>
                              <span className="cd">{row.code}</span>
                              <span className="nm">
                                {row.name}
                                <small>{t(l.approved ? "rg3.admin.langApproved" : "rg3.admin.langReview", { share: l.share })}</small>
                              </span>
                              <span className={`rt ${openRateTone(l.openRate)}`}>{l.openRate != null ? `%${l.openRate}` : "—"}</span>
                            </button>
                          );
                        })}
                      </div>
                      <Editor campaign={c} lang={lang} onSave={saveTemplate} t={t} />
                    </div>
                  ) : null}
                  {tab === "audience" ? (
                    <div className="rg-pane">
                      <p className="rg-pop-sub">{t(`rg3.campaigns.${c.id}.audience`)}</p>
                      <div className="rg-kpis three">
                        <Kpi label={t("rg3.admin.reachNow")} value={ws.stats.reachableNow ?? 0} />
                        <Kpi label={t("rg3.admin.reachLater")} value={(ws.stats.reachable ?? 0) - (ws.stats.reachableNow ?? 0)} />
                        <Kpi label={t("rg3.admin.holdout")} value={`%${c.holdoutPct}`} />
                      </div>
                    </div>
                  ) : null}
                  {tab === "limits" ? <LimitsPane c={c} t={t} onSave={async (patch) => { const r = await reengageAdmin.save(c.id, patch); setWs((w) => ({ ...w, campaign: r.campaign })); flash(t("rg3.admin.saved")); }} /> : null}
                  {tab === "results" ? <ResultsPane ws={ws} t={t} /> : null}
                  {tab === "log" ? <LogPane ws={ws} t={t} locale={locale} onOpenWave={(id) => setLive({ waveId: id, minimized: false })} /> : null}
                  <div className="rg-ws-foot">
                    <div className="rg-card inner">
                      <b className="rg-card-t">{t("rg3.admin.notInWave")}</b>
                      {excludedRows(ws.excluded).map((r) => (
                        <div key={r.id} className="rg-ex">
                          <span>{t(`rg3.admin.ex_${r.id}`)}</span>
                          <span className="rg-bar" aria-hidden="true">
                            <i className={`tone-${r.id}`} style={{ width: `${r.pct}%` }} />
                          </span>
                          <b>{r.value}</b>
                        </div>
                      ))}
                    </div>
                    <div className="rg-card inner">
                      <div className="rg-card-h">
                        <b className="rg-card-t">{t("rg3.admin.bestHours")}</b>
                        <small>{t("rg3.admin.last30")}</small>
                      </div>
                      <HoursChart hours={ws.bestHours} t={t} />
                      <small className="rg-foot">{t("rg3.admin.hoursFoot")}</small>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </section>

        {c && c.id !== "friend_call" ? <UserPreview campaignId={c.id} lang={prevLang} setLang={(l) => { setPrevLang(l); setLang(l); }} t={t} locale={locale} /> : <aside className="rg-userprev empty" />}
      </div>
      {live ? <LiveWaveWindow waveId={live.waveId} minimized={live.minimized} onMinimize={(m) => setLive((x) => ({ ...x, minimized: m }))} onClose={() => setLive(null)} onChanged={() => setNonce((n) => n + 1)} t={t} locale={locale} /> : null}
      {dialog ? <ReasonDialog {...dialog} t={t} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function LimitsPane({ c, t, onSave }) {
  const [holdout, setHoldout] = useState(c.holdoutPct);
  const [push, setPush] = useState(c.channels.includes("push"));
  const [mail, setMail] = useState(c.channels.includes("email"));
  const [busy, setBusy] = useState(false);
  const dirty = holdout !== c.holdoutPct || push !== c.channels.includes("push") || mail !== c.channels.includes("email");
  return (
    <div className="rg-pane">
      <ul className="rg-rules">
        <li>
          <Moon size={14} /> {t("rg3.admin.ruleQuiet")}
        </li>
        <li>
          <Clock size={14} /> {t("rg3.admin.ruleWeekly")}
        </li>
        <li>
          <Bell size={14} /> {t("rg3.admin.ruleFriendFirst")}
        </li>
        <li>
          <X size={14} /> {t("rg3.admin.ruleStop")}
        </li>
        <li>
          <Eye size={14} /> {t("rg3.admin.ruleOnce")}
        </li>
      </ul>
      <div className="rg-srow">
        <div className="tx">
          <b>{t("rg3.admin.holdout")}</b>
          <small>{t("rg3.admin.holdoutSub")}</small>
        </div>
        <input type="number" min={0} max={50} value={holdout} onChange={(e) => setHoldout(Math.max(0, Math.min(50, Number(e.target.value) || 0)))} aria-label={t("rg3.admin.holdout")} />
      </div>
      <div className="rg-srow">
        <div className="tx">
          <b>{t("rg3.admin.channels")}</b>
        </div>
        <label className="rg-check-l">
          <GlassCheckbox checked={push} onChange={(e) => setPush(e.target.checked)} /> {t("rg3.admin.chPush")}
        </label>
        <label className="rg-check-l">
          <GlassCheckbox checked={mail} onChange={(e) => setMail(e.target.checked)} /> {t("rg3.admin.chEmail")}
        </label>
      </div>
      <button
        type="button"
        className="rg-btn primary"
        disabled={!dirty || busy || (!push && !mail)}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave({ holdoutPct: holdout, channels: [push && "push", mail && "email"].filter(Boolean) });
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("rg3.common.save")}
      </button>
    </div>
  );
}

function ResultsPane({ ws, t }) {
  const f = ws.results.funnel;
  const o = ws.results.outcomes;
  const max = Math.max(1, f.sent);
  const rows = [
    ["sent", f.sent],
    ["delivered", f.delivered],
    ["opened", f.opened],
    ["openedApp", f.openedApp],
    ["acted", f.acted],
  ];
  return (
    <div className="rg-pane">
      <div className="rg-funnel">
        {rows.map(([k, v]) => (
          <div key={k}>
            <span>{t(`rg3.admin.f_${k}`)}</span>
            <i className={k === "acted" ? "green" : ""} style={{ width: `${Math.max(4, (v / max) * 100)}%` }}>
              {v}
            </i>
          </div>
        ))}
      </div>
      <div className="rg-kpis">
        <Kpi label={t("rg3.admin.r_return")} value={ws.results.lift.rate != null ? `%${ws.results.lift.rate}` : "—"} tone="green" />
        <Kpi label={t("rg3.admin.r_control")} value={ws.results.lift.control != null ? `%${ws.results.lift.control}` : "—"} />
        <Kpi label={t("rg3.admin.r_net")} value={ws.results.lift.net != null ? `${ws.results.lift.net > 0 ? "+" : ""}${ws.results.lift.net}` : "—"} />
        <Kpi label={t("rg3.admin.r_firstMsg")} value={o.firstMessageRate.rate != null ? `%${o.firstMessageRate.rate}` : "—"} />
      </div>
      <p className="rg-foot">{t("rg3.admin.measureFoot", { target: o.d7Return48h.target })}</p>
    </div>
  );
}

function LogPane({ ws, t, locale, onOpenWave }) {
  const fmt = (iso) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return (
    <div className="rg-pane rg-log">
      {(ws.waves || []).map((w) => (
        <button key={w.id} type="button" className="rg-logrow" onClick={() => onOpenWave(w.id)}>
          <time>{fmt(w.started_at)}</time>
          <span className="tx">
            <b>{t("rg3.admin.waveLine", { label: w.label || "", count: w.audience })}</b>
            <small>{t(`rg3.admin.wave_${w.status}`, { sent: w.sent })}{w.dry_run ? ` · ${t("rg3.admin.modeDry")}` : ""}{w.recall_reason ? ` · ${t(`rg3.admin.reason_${w.recall_reason}`)}` : ""}</small>
          </span>
        </button>
      ))}
      {(ws.log || []).map((l, i) => (
        <div key={`l${i}`} className="rg-logrow">
          <time>{fmt(l.at)}</time>
          <span className="tx">
            <b>
              {l.by || t("rg3.admin.system")} · {t(`rg3.admin.act_${l.action}`, { detail: l.detail || "" })}
            </b>
            {l.reason || l.note ? <small>{[l.action === "recall" && l.reason ? t(`rg3.admin.reason_${l.reason}`) : l.reason, l.note].filter(Boolean).join(" · ")}</small> : null}
          </span>
        </div>
      ))}
      {!(ws.waves || []).length && !(ws.log || []).length ? <p className="rg-empty">{t("rg3.admin.logEmpty")}</p> : null}
    </div>
  );
}

