import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calendar, Clock, Wrench, Globe, Monitor, Smartphone, Megaphone, Shield, Bell,
  Eye, History, X, Edit3, ChevronDown, AlertTriangle, Timer, Square,
} from "../ui/Icon.jsx";
import { adminFetch } from "../../api/adminHttp";
import { useLocale } from "../../context/LocaleContext";
import {
  countdownParts, formatTrtShort, formatTrtTime, formatDuration, approxHours, progress,
  toTrtInputs, fromTrtInputs, dottedDate, isSameTrtDay, formatTrtLongDate,
} from "../../lib/maintenance";
import { MaintenanceScreen, appIconSrc } from "../maintenance/MaintenanceUi";
import "../../styles/maintenance.css";

const pad = (n) => String(n).padStart(2, "0");
const PLATFORM_ICONS = { web: Globe, electron: Monitor, ios: Smartphone, android: Smartphone };
const PLATFORM_LABELS = { web: "Web", electron: "Electron", ios: "iOS", android: "Android" };
const ANNOUNCE = [15, 30, 60, 120, 360, 1440];
const EXTEND = [15, 30, 60, 120];

function announceLabel(n, t) {
  if (n === 1440) return t("maint.dayBefore");
  if (n >= 120) return t("maint.hoursBefore", { n: n / 60 });
  return t("maint.minutesBefore", { n });
}

function defaultsFrom(win, t) {
  if (win && (win.status === "scheduled" || win.status === "active")) {
    const s = toTrtInputs(win.startsAt);
    const e = toTrtInputs(win.endsAt);
    return {
      title: win.title || "",
      startDate: s.date, startTime: s.time, endDate: e.date, endTime: e.time,
      kind: win.kind, platforms: win.platforms,
      message: win.message,
      announceOn: win.announceMinutes != null, announceMinutes: win.announceMinutes ?? 60,
      adminsBypass: win.adminsBypass, notifyOnEnd: win.notifyOnEnd,
    };
  }
  // Next night 02:00–04:30 TRT.
  const tomorrow = toTrtInputs(Date.now() + 24 * 3600_000).date;
  return {
    title: "", startDate: tomorrow, startTime: "02:00", endDate: tomorrow, endTime: "04:30",
    kind: "planned", platforms: ["web", "electron", "ios", "android"],
    message: t("maint.defaultMessage"),
    announceOn: true, announceMinutes: 60, adminsBypass: true, notifyOnEnd: false,
  };
}

function statusBadge(status, t) {
  if (status === "active") return <span className="mt-badge mt-b-act">{t("maint.statusActiveShort")}</span>;
  if (status === "scheduled") return <span className="mt-badge mt-b-plan">{t("maint.statusScheduled")}</span>;
  if (status === "completed") return <span className="mt-badge mt-b-done">{t("maint.statusCompleted")}</span>;
  return <span className="mt-badge mt-b-cancel">{t("maint.statusCancelled")}</span>;
}

function errText(err, t) {
  const code = err?.message || "";
  const key = `maint.err_${code}`;
  const v = t(key);
  return v && v !== key ? v : t("maint.err_generic");
}

/** Native date/time picker under a TRT-formatted label ("22.10.2026", "02:00"); works with touch. */
function PickerPart({ type, value, onChange, disabled, label, inputRef, text }) {
  return (
    <span className={`seg-part is-${type}`}>
      <span className="seg-text">{text || "--"}</span>
      <input
        ref={inputRef}
        type={type}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* not allowed */ } }}
      />
    </span>
  );
}

function Toggle({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`mt-tg${on ? " on" : ""}`} onClick={() => onChange(!on)} />;
}

function Modal({ children, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="mt-modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mt-modal mt-glass" role="dialog" aria-modal="true">{children}</div>
    </div>,
    document.body
  );
}

export default function MaintenanceTab({ socket }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [now, setNow] = useState(Date.now());
  const [skew, setSkew] = useState(0);
  const [modal, setModal] = useState(null); // "cancel" | "end" | "extend" | "preview"
  const [cancelReason, setCancelReason] = useState("");
  const [cancelWord, setCancelWord] = useState("");
  const [extendBy, setExtendBy] = useState(30);
  const startRef = useRef(null);
  const messageRef = useRef(null);
  const formRef = useRef(null);

  const load = useCallback(async (resetForm = false) => {
    try {
      const d = await adminFetch("/maintenance/windows");
      setData(d);
      setLoadErr("");
      const st = Date.parse(d.serverTime);
      if (Number.isFinite(st)) setSkew(st - Date.now());
      setForm((prev) => (resetForm || !prev ? defaultsFrom(d.current, t) : prev));
      if (resetForm) setDirty(false);
    } catch {
      setLoadErr(t("maint.loadFailed"));
    }
  }, [t]);

  useEffect(() => { load(true); }, [load]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!socket) return undefined;
    const on = () => load(!dirty);
    socket.on("maintenance:state", on);
    socket.on("maintenance:ended", on);
    return () => { socket.off("maintenance:state", on); socket.off("maintenance:ended", on); };
  }, [socket, load, dirty]);

  const cur = now + skew;
  const win = data?.current || null;
  // Local clock moves scheduled → active → completed between pushes.
  const liveStatus = useMemo(() => {
    if (!win) return null;
    if (win.status !== "scheduled" && win.status !== "active") return win.status;
    if (cur >= Date.parse(win.endsAt)) return "completed";
    return cur >= Date.parse(win.startsAt) ? "active" : "scheduled";
  }, [win, cur]);
  useEffect(() => {
    if (win && liveStatus !== win.status) load(!dirty);
  }, [liveStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); setMsg({ type: "", text: "" }); };

  const editable = win && (liveStatus === "scheduled" || liveStatus === "active");
  const active = liveStatus === "active";

  const payload = () => ({
    title: form.title,
    startsAt: fromTrtInputs(form.startDate, form.startTime),
    endsAt: fromTrtInputs(form.endDate, form.endTime),
    kind: form.kind,
    platforms: form.platforms,
    message: form.message,
    announceMinutes: form.announceOn ? Number(form.announceMinutes) : null,
    adminsBypass: form.adminsBypass,
    notifyOnEnd: form.notifyOnEnd,
  });

  const save = async () => {
    setBusy(true);
    setMsg({ type: "", text: "" });
    try {
      const body = payload();
      if (editable) {
        if (active) delete body.startsAt;
        await adminFetch(`/maintenance/windows/${win.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await adminFetch("/maintenance/windows", { method: "POST", body: JSON.stringify(body) });
      }
      await load(true);
      setMsg({ type: "ok", text: t("maint.saved") });
    } catch (err) {
      setMsg({ type: "err", text: errText(err, t) });
    } finally {
      setBusy(false);
    }
  };

  const action = async (path, body) => {
    setBusy(true);
    try {
      await adminFetch(`/maintenance/windows/${win.id}/${path}`, { method: "POST", body: JSON.stringify(body || {}) });
      setModal(null);
      setCancelReason("");
      setCancelWord("");
      await load(true);
    } catch (err) {
      setMsg({ type: "err", text: errText(err, t) });
      setModal(null);
    } finally {
      setBusy(false);
    }
  };

  const focusField = (ref) => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => ref.current?.focus({ preventScroll: true }), 250);
  };

  if (!data && loadErr) {
    return (
      <section className="admin-section mt-root">
        <div className="mt-card"><p className="mt-err">{loadErr}</p><button type="button" className="mt-btn" onClick={() => load(true)}>{t("maint.retry")}</button></div>
      </section>
    );
  }
  if (!data || !form) return <section className="admin-section mt-root"><p className="mt-muted">{t("common.loading")}</p></section>;

  const s = data.summary || {};
  const kpis = [
    { label: t("maint.kpiSystem"), value: s.systemStatus === "maintenance" || active ? t("maint.kpiInMaintenance") : t("maint.kpiOperational"), color: s.systemStatus === "maintenance" || active ? "#ff9f0a" : "#30d158" },
    s.nextStartsAt ? { label: t("maint.kpiNext"), value: formatTrtShort(s.nextStartsAt, locale), color: "#0a84ff" } : null,
    s.monthDowntimeMs ? { label: t("maint.kpiMonth"), value: formatDuration(s.monthDowntimeMs, locale), color: "#ff9f0a" } : null,
    s.recentlyActiveUsers ? { label: t("maint.kpiAffected"), value: `~${s.recentlyActiveUsers.toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}`, color: "#bf5af2", title: t("maint.kpiAffectedHint") } : null,
  ].filter(Boolean);

  const target = active ? win.endsAt : win?.startsAt;
  const cd = target ? countdownParts(target, cur) : null;
  const durMs = win ? Date.parse(win.endsAt) - Date.parse(win.startsAt) : 0;
  const pct = active ? Math.round(progress(win.startsAt, win.endsAt, cur) * 100) : 0;

  // Live preview follows the form, not the saved row.
  const pStart = fromTrtInputs(form.startDate, form.startTime);
  const pEnd = fromTrtInputs(form.endDate, form.endTime);
  const pDur = pStart && pEnd ? Date.parse(pEnd) - Date.parse(pStart) : 0;
  const kindLower = form.kind === "emergency" ? t("maint.kindEmergencyLower") : t("maint.kindPlannedLower");
  const preText = pStart && pDur > 0
    ? isSameTrtDay(pStart, cur)
      ? t("maint.preAnnounceToday", { time: formatTrtTime(pStart), kind: kindLower, dur: approxHours(pDur, locale) })
      : t("maint.preAnnounceDate", { date: formatTrtShort(pStart, locale), kind: kindLower, dur: approxHours(pDur, locale) })
    : "";
  const previewWindow = { kind: form.kind, message: form.message, startsAt: pStart || new Date(cur).toISOString(), endsAt: pEnd || new Date(cur + 3600_000).toISOString() };

  const history = data.history || [];
  const events = data.events || [];

  return (
    <section className="admin-section mt-root">
      <div className={`mt-kpis n${kpis.length}`}>
        {kpis.map((k) => (
          <div className="mt-card mt-kpi" key={k.label} title={k.title || undefined}>
            <div className="mt-kpi-label">{k.label}</div>
            <div className="mt-kpi-value"><span className="mt-dot" style={{ background: k.color, boxShadow: `0 0 10px ${k.color}` }} />{k.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-grid">
        <div className="mt-col">
          {editable ? (
            <div className={`mt-card mt-status${active ? " is-active" : ""}`}>
              <div className="mt-status-head">
                <div className="mt-status-ico"><Calendar size={20} /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="mt-status-title">{win.title}</div>
                  <div className="mt-muted mt-status-meta">
                    {win.seq ? `#BKM-${pad(win.seq).padStart(4, "0")} · ` : ""}
                    {win.createdByUsername ? t("maint.createdBy", { name: win.createdByUsername }) : ""}
                    {win.createdAt ? ` · ${formatTrtShort(win.createdAt, locale)}` : ""}
                  </div>
                </div>
                {active ? (
                  <span className="mt-badge mt-b-act"><span className="mt-dot" style={{ background: "#ff9f0a", boxShadow: "0 0 8px #ff9f0a" }} />{t("maint.statusActive")}</span>
                ) : (
                  <span className="mt-badge mt-b-plan"><span className="mt-dot" style={{ background: "#0a84ff" }} />{t("maint.statusScheduled")}</span>
                )}
              </div>
              <div className="mt-eyebrow">{active ? t("maint.untilEnd") : t("maint.untilStart")}</div>
              <div className="mt-cd">
                <div><b>{pad(cd.days)}</b><small>{t("maint.days")}</small></div>
                <div><b>{pad(cd.hours)}</b><small>{t("maint.hours")}</small></div>
                <div><b>{pad(cd.minutes)}</b><small>{t("maint.minutes")}</small></div>
                <div><b>{pad(cd.seconds)}</b><small>{t("maint.seconds")}</small></div>
              </div>
              {active && <div className="mt-progress"><i style={{ width: `${pct}%` }} /></div>}
              <div className="mt-when">
                <div><Clock size={14} style={{ opacity: 0.6 }} /> {formatTrtShort(win.startsAt, locale)} → {formatTrtTime(win.endsAt)} <span className="mt-muted">TRT</span></div>
                <div className="mt-muted">{t("maint.duration", { value: formatDuration(durMs, locale) })}</div>
              </div>
              <div className="mt-actions">
                {active ? (
                  <button type="button" className="mt-btn sm" onClick={() => setModal("extend")}><Timer size={15} /> {t("maint.extend")}</button>
                ) : (
                  <button type="button" className="mt-btn sm" onClick={() => focusField(startRef)}><Calendar size={15} /> {t("maint.editDates")}</button>
                )}
                <button type="button" className="mt-btn sm" onClick={() => focusField(messageRef)}><Edit3 size={15} /> {t("maint.editMessage")}</button>
                <button type="button" className="mt-btn danger sm push" onClick={() => setModal(active ? "end" : "cancel")}>
                  <X size={15} /> {active ? t("maint.endNow") : t("maint.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-card mt-status">
              <div className="mt-empty">
                <div className="mt-status-ico"><Calendar size={20} /></div>
                <div><div className="mt-status-title">{t("maint.noneTitle")}</div><div className="mt-muted mt-status-meta">{t("maint.noneHint")}</div></div>
              </div>
            </div>
          )}

          <div className="mt-card" ref={formRef}>
            <h3><Wrench size={16} /> {editable ? t("maint.formTitle") : t("maint.formTitleNew")}<span className="sub">{t("maint.timezone")}</span></h3>
            <label className="mt-f">
              <span>{t("maint.titleLabel")}</span>
              <div className="mt-in"><input type="text" value={form.title} maxLength={80} placeholder={t("maint.titlePlaceholder")} onChange={(e) => set({ title: e.target.value })} /></div>
            </label>
            <div className="mt-two">
              <div className="mt-f">
                <span>{t("maint.start")}</span>
                <div className="mt-in" aria-disabled={active}>
                  <Calendar size={14} className="mt-i" />
                  <PickerPart type="date" inputRef={startRef} label={t("maint.start")} value={form.startDate} text={dottedDate(form.startDate)} disabled={active} onChange={(v) => set({ startDate: v, endDate: form.endDate < v ? v : form.endDate })} />
                  <span className="mt-muted">·</span>
                  <PickerPart type="time" label={`${t("maint.start")} ${t("maint.hours")}`} value={form.startTime} text={form.startTime} disabled={active} onChange={(v) => set({ startTime: v })} />
                </div>
              </div>
              <div className="mt-f">
                <span>{t("maint.end")}</span>
                <div className="mt-in">
                  <Calendar size={14} className="mt-i" />
                  <PickerPart type="date" label={t("maint.end")} value={form.endDate} text={dottedDate(form.endDate)} onChange={(v) => set({ endDate: v })} />
                  <span className="mt-muted">·</span>
                  <PickerPart type="time" label={`${t("maint.end")} ${t("maint.hours")}`} value={form.endTime} text={form.endTime} onChange={(v) => set({ endTime: v })} />
                </div>
              </div>
            </div>
            <div className="mt-f">
              <span>{t("maint.kind")}</span>
              <div className="mt-seg" role="radiogroup">
                <button type="button" role="radio" aria-checked={form.kind === "planned"} className={form.kind === "planned" ? "on" : ""} onClick={() => set({ kind: "planned" })}>{t("maint.planned")}</button>
                <button type="button" role="radio" aria-checked={form.kind === "emergency"} className={form.kind === "emergency" ? "on r" : ""} onClick={() => set({ kind: "emergency" })}>{t("maint.emergency")}</button>
              </div>
            </div>
            <div className="mt-f">
              <span>{t("maint.platforms")}</span>
              <div className="mt-pl">
                {(data.options?.platforms || ["web", "electron", "ios", "android"]).map((p) => {
                  const Icon = PLATFORM_ICONS[p] || Globe;
                  const on = form.platforms.includes(p);
                  return (
                    <button type="button" key={p} aria-pressed={on} className={on ? "on" : ""} onClick={() => set({ platforms: on ? form.platforms.filter((x) => x !== p) : [...form.platforms, p] })}>
                      <Icon size={14} />{PLATFORM_LABELS[p]}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="mt-f">
              <span>{t("maint.message")}</span>
              <div className="mt-in ta"><textarea ref={messageRef} rows={2} maxLength={600} value={form.message} onChange={(e) => set({ message: e.target.value })} /></div>
            </label>
            <div className="mt-row first">
              <Megaphone size={16} color="#ffb340" className="mt-i" />
              <div className="mt-row-copy"><b>{t("maint.banner")}</b><div className="mt-muted">{t("maint.bannerHint")}</div></div>
              <div className="mt-in sel">
                <span>{announceLabel(Number(form.announceMinutes), t)}</span><ChevronDown size={13} />
                <select aria-label={t("maint.banner")} value={form.announceMinutes} onChange={(e) => set({ announceMinutes: Number(e.target.value), announceOn: true })}>
                  {ANNOUNCE.map((n) => <option key={n} value={n}>{announceLabel(n, t)}</option>)}
                </select>
              </div>
              <Toggle on={form.announceOn} label={t("maint.banner")} onChange={(v) => set({ announceOn: v })} />
            </div>
            <div className="mt-row">
              <Shield size={16} color="#6cb6ff" className="mt-i" />
              <div className="mt-row-copy"><b>{t("maint.bypass")}</b><div className="mt-muted">{t("maint.bypassHint")}</div></div>
              <Toggle on={form.adminsBypass} label={t("maint.bypass")} onChange={(v) => set({ adminsBypass: v })} />
            </div>
            <div className="mt-row">
              <Bell size={16} color="#bf5af2" className="mt-i" />
              <div className="mt-row-copy"><b>{t("maint.notify")}</b></div>
              <Toggle on={form.notifyOnEnd} label={t("maint.notify")} onChange={(v) => set({ notifyOnEnd: v })} />
            </div>
            <div className="mt-form-foot">
              <button type="button" className="mt-btn" style={{ height: 36 }} onClick={() => setModal("preview")}><Eye size={15} /> {t("maint.preview")}</button>
              <button type="button" className="mt-btn primary" style={{ height: 36 }} disabled={busy || (editable && !dirty)} onClick={save}>
                {busy ? t("maint.saving") : editable ? t("maint.save") : t("maint.create")}
              </button>
            </div>
            {msg.text && <div className={msg.type === "ok" ? "mt-ok" : "mt-err"} role="status">{msg.text}</div>}
          </div>
        </div>

        <div className="mt-col">
          <div className="mt-card">
            <h3><Eye size={16} /> {t("maint.livePreview")}<span className="sub">{t("maint.userScreen")}</span></h3>
            <div className="mt-prev">
              <img src={appIconSrc()} alt="" width={38} height={38} />
              <div className="mt-prev-title">{t("maint.screenTitle")}</div>
              <div className="mt-muted mt-prev-msg">{form.message}</div>
              {pEnd && <div className="mt-prev-pill">{t("maint.estimatedEnd", { time: formatTrtTime(pEnd) })}</div>}
            </div>
            {form.announceOn && preText ? (
              <div className="mt-pre"><Megaphone size={14} className="mt-i" /><span><b>{t("maint.preAnnounce")}</b> {preText}</span></div>
            ) : (
              <div className="mt-pre off"><Megaphone size={14} className="mt-i" /><span>{t("maint.preAnnounceOff")}</span></div>
            )}
          </div>

          <div className="mt-card">
            <h3><History size={16} /> {t("maint.history")}{history.length > 0 && <span className="sub">{t("maint.lastN", { n: history.length })}</span>}</h3>
            {history.length === 0 ? (
              <p className="mt-muted" style={{ fontSize: 12.5, margin: 0 }}>{t("maint.historyEmpty")}</p>
            ) : (
              <table className="mt-h">
                <thead><tr><th>{t("maint.colDate")}</th><th>{t("maint.colKind")}</th><th>{t("maint.colDuration")}</th><th>{t("maint.colStatus")}</th></tr></thead>
                <tbody>
                  {history.map((h) => {
                    const st = h.id === win?.id ? liveStatus : h.status;
                    const dur = st === "cancelled" && !h.downtimeMs ? "—" : formatDuration(st === "scheduled" ? Date.parse(h.endsAt) - Date.parse(h.startsAt) : h.downtimeMs, locale);
                    return (
                      <tr key={h.id} title={h.cancelReason ? t("maint.auditReason", { reason: h.cancelReason }) : undefined}>
                        <td>{formatTrtShort(h.startsAt, locale)}</td>
                        <td>{h.kind === "emergency" ? <span className="mt-badge mt-b-urg">{t("maint.emergencyShort")}</span> : <span className="mt-muted">{t("maint.plannedShort")}</span>}</td>
                        <td className="mt-muted">{dur}</td>
                        <td>{statusBadge(st, t)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {events.length > 0 && (
              <div className="mt-audit">
                <h4>{t("maint.auditTitle")}</h4>
                <ul>
                  {events.map((e) => (
                    <li key={e.id}>
                      <b>{e.actorUsername || "?"}</b>
                      <span>{t(`maint.audit_${e.action}`, { n: e.details?.minutes })}</span>
                      {e.details?.reason ? <span className="mt-muted">· {t("maint.auditReason", { reason: e.details.reason })}</span> : null}
                      <time dateTime={e.at}>{formatTrtShort(e.at, locale)}</time>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {modal === "cancel" && win && (
        <Modal onClose={() => setModal(null)}>
          <div className="mt-modal-ico"><AlertTriangle size={26} /></div>
          <h2>{t("maint.cancelTitle")}</h2>
          <p className="mt-muted">{t("maint.cancelBody", { title: win.title, date: formatTrtShort(win.startsAt, locale) })}</p>
          <div className="mt-in"><input type="text" maxLength={300} placeholder={t("maint.cancelReason")} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></div>
          <div className="mt-in confirm">
            <input type="text" autoFocus autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label={t("maint.cancelTypeHint")} value={cancelWord} onChange={(e) => setCancelWord(e.target.value)} placeholder={t("maint.cancelWord")} />
            <span className="mt-muted hint">{t("maint.cancelTypeHint")}</span>
          </div>
          <div className="mt-modal-acts">
            <button type="button" className="mt-btn" onClick={() => setModal(null)}>{t("maint.keep")}</button>
            <button type="button" className="mt-btn dangerfill" disabled={busy || cancelWord.trim().toLocaleUpperCase("tr-TR") !== "İPTAL"} onClick={() => action("cancel", { confirm: cancelWord.trim(), reason: cancelReason })}>{t("maint.cancel")}</button>
          </div>
        </Modal>
      )}
      {modal === "end" && win && (
        <Modal onClose={() => setModal(null)}>
          <div className="mt-modal-ico"><Square size={24} /></div>
          <h2>{t("maint.endTitle")}</h2>
          <p className="mt-muted">{t("maint.endBody", { title: win.title })}</p>
          <div className="mt-modal-acts">
            <button type="button" className="mt-btn" onClick={() => setModal(null)}>{t("maint.keep")}</button>
            <button type="button" className="mt-btn dangerfill" disabled={busy} onClick={() => action("end")}>{t("maint.endConfirm")}</button>
          </div>
        </Modal>
      )}
      {modal === "extend" && win && (
        <Modal onClose={() => setModal(null)}>
          <div className="mt-modal-ico info"><Timer size={26} /></div>
          <h2>{t("maint.extendTitle")}</h2>
          <p className="mt-muted">{t("maint.extendBody", { time: `${formatTrtTime(Date.parse(win.endsAt) + extendBy * 60000)}${isSameTrtDay(win.endsAt, Date.parse(win.endsAt) + extendBy * 60000) ? "" : ` · ${formatTrtLongDate(Date.parse(win.endsAt) + extendBy * 60000, locale)}`}` })}</p>
          <div className="mt-chips">
            {EXTEND.map((n) => <button type="button" key={n} className={extendBy === n ? "on" : ""} onClick={() => setExtendBy(n)}>{t("maint.extendBy", { n })}</button>)}
          </div>
          <div className="mt-modal-acts">
            <button type="button" className="mt-btn" onClick={() => setModal(null)}>{t("maint.keep")}</button>
            <button type="button" className="mt-btn primary" disabled={busy} onClick={() => action("extend", { minutes: extendBy })}>{t("maint.extendConfirm")}</button>
          </div>
        </Modal>
      )}
      {modal === "preview" && createPortal(
        <div onClick={() => setModal(null)}>
          <MaintenanceScreen m={previewWindow} now={Math.max(cur, Date.parse(previewWindow.startsAt))} t={t} locale={locale} onRetry={() => setModal(null)} onNotify={() => setModal(null)} notifyArmed={false} />
        </div>,
        document.body
      )}
    </section>
  );
}
