/* Ajan dialogs: Kayıtlı plan yap, Planı zamanla, Zamanlanmış görevler. */
import { useEffect, useState } from "react";
import { Dialog, Ic, Switch } from "./agentUi.jsx";
import { clockToMinutes, minutesToClock, schedulePresets, toLocalInput } from "./agentOpsModel.js";

const EVERY = ["hourly", "every6h", "daily", "weekly"];

function when(iso, locale) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function TaskFields({ t, value, onChange, prompts }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="ago-form">
      <label className="ago-field">
        <span className="ago-lab">{t("agentOps.tasks.name")}</span>
        <input className="ago-input" value={value.title} maxLength={80} placeholder={t("agentOps.tasks.namePh")} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label className="ago-field">
        <span className="ago-lab ago-lab-row">
          {t("agentOps.tasks.prompt")}
          {prompts?.length ? (
            <select className="ago-mini-select" value="" aria-label={t("agentOps.tasks.fromPrompt")} onChange={(e) => { const p = prompts.find((x) => x.id === e.target.value); if (p) set({ prompt: p.prompt, title: value.title || p.title }); }}>
              <option value="">{t("agentOps.tasks.fromPrompt")}</option>
              {prompts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          ) : null}
        </span>
        <textarea className="ago-input ago-textarea" rows={3} value={value.prompt} maxLength={2000} placeholder={t("agentOps.tasks.promptPh")} onChange={(e) => set({ prompt: e.target.value })} />
      </label>
      <div className="ago-field-row">
        <div className="ago-field">
          <span className="ago-lab">{t("agentOps.tasks.every")}</span>
          <div className="ago-fps" role="radiogroup" aria-label={t("agentOps.tasks.every")}>
            {EVERY.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={value.every === id} className={`ago-fp${value.every === id ? " is-on" : ""}`} onClick={() => set({ every: id })}>
                {t(`agentOps.tasks.ev.${id}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="ago-field-row">
        {value.every === "weekly" ? (
          <label className="ago-field">
            <span className="ago-lab">{t("agentOps.tasks.weekday")}</span>
            <select className="ago-input" value={value.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{t(`agentOps.tasks.wd.${d}`)}</option>)}
            </select>
          </label>
        ) : null}
        {value.every === "hourly" || value.every === "every6h" ? (
          <label className="ago-field">
            <span className="ago-lab">{t("agentOps.tasks.minute")}</span>
            <input className="ago-input" type="number" min={0} max={59} value={value.atMinute % 60} onChange={(e) => set({ atMinute: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })} />
          </label>
        ) : (
          <label className="ago-field">
            <span className="ago-lab">{t("agentOps.tasks.at")}</span>
            <input className="ago-input" type="time" value={minutesToClock(value.atMinute)} onChange={(e) => { const m = clockToMinutes(e.target.value); if (m != null) set({ atMinute: m }); }} />
          </label>
        )}
      </div>
      <p className="ago-sub">{t("agentOps.tasks.sessionNote")}</p>
    </div>
  );
}

const blankTask = (prompt = "", title = "") => ({ title, prompt, every: "daily", atMinute: 9 * 60, weekday: 1 });

export function SavePlanDialog({ t, open, onClose, initialPrompt, initialTitle, onSave, prompts }) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [shared, setShared] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [task, setTask] = useState(blankTask());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle || "");
    setPrompt(initialPrompt || "");
    setShared(false);
    setSchedule(false);
    setTask(blankTask(initialPrompt || "", initialTitle || ""));
    setErr("");
  }, [open, initialPrompt, initialTitle]);
  const submit = async () => {
    if (!title.trim() || !prompt.trim()) return setErr(t("agentOps.err.BAD_TASK"));
    setBusy(true);
    setErr("");
    try {
      await onSave({ title: title.trim(), prompt: prompt.trim(), shared, task: schedule ? { ...task, title: title.trim(), prompt: prompt.trim() } : null });
      onClose();
    } catch (e) {
      setErr(e?.message || t("agentOps.err.generic"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon="copy"
      title={t("agentOps.savePlan.title")}
      subtitle={t("agentOps.savePlan.lead")}
      closeLabel={t("agentOps.close")}
      footer={(
        <>
          <button type="button" className="ago-btn" onClick={onClose} disabled={busy}>{t("agentOps.cancel")}</button>
          <button type="button" className="ago-btn is-p" onClick={submit} disabled={busy}><Ic name="bm" size={15} />{t("agentOps.save")}</button>
        </>
      )}
    >
      <div className="ago-form">
        <label className="ago-field">
          <span className="ago-lab">{t("agentOps.savePlan.name")}</span>
          <input className="ago-input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label className="ago-field">
          <span className="ago-lab">{t("agentOps.savePlan.prompt")}</span>
          <textarea className="ago-input ago-textarea" rows={3} value={prompt} maxLength={2000} onChange={(e) => setPrompt(e.target.value)} />
        </label>
        <div className="ago-policy">
          <span className="ago-sub">{t("agentOps.savePlan.shared")}</span>
          <span className="ago-sp" />
          <Switch on={shared} onChange={setShared} label={t("agentOps.savePlan.shared")} />
        </div>
        <div className="ago-policy">
          <span className="ago-sub">{t("agentOps.savePlan.alsoSchedule")}</span>
          <span className="ago-sp" />
          <Switch on={schedule} onChange={setSchedule} label={t("agentOps.savePlan.alsoSchedule")} />
        </div>
        {schedule ? <TaskFields t={t} value={task} onChange={setTask} prompts={prompts} /> : null}
        {err ? <p className="ago-err" role="alert">{err}</p> : null}
      </div>
    </Dialog>
  );
}

export function SchedulePlanDialog({ t, open, onClose, onConfirm, planLabel }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const presets = schedulePresets();
  useEffect(() => {
    if (open) {
      setValue(toLocalInput(presets[0].at));
      setErr("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) return setErr(t("agentOps.err.BAD_SCHEDULE"));
    setBusy(true);
    setErr("");
    try {
      await onConfirm(at.toISOString());
      onClose();
    } catch (e) {
      setErr(e?.message || t("agentOps.err.generic"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon="cal"
      title={t("agentOps.schedule.title")}
      subtitle={planLabel}
      closeLabel={t("agentOps.close")}
      footer={(
        <>
          <button type="button" className="ago-btn" onClick={onClose} disabled={busy}>{t("agentOps.cancel")}</button>
          <button type="button" className="ago-btn is-p" onClick={submit} disabled={busy}><Ic name="shield" size={15} />{t("agentOps.schedule.confirm")}</button>
        </>
      )}
    >
      <div className="ago-form">
        <p className="ago-sub">{t("agentOps.schedule.lead")}</p>
        <div className="ago-fps">
          {presets.map((p) => {
            const v = toLocalInput(p.at);
            return (
              <button key={p.id} type="button" className={`ago-fp${value === v ? " is-on" : ""}`} onClick={() => setValue(v)}>
                {t(`agentOps.schedule.${p.id}`)}
              </button>
            );
          })}
        </div>
        <label className="ago-field">
          <span className="ago-lab">{t("agentOps.schedule.when")}</span>
          <input className="ago-input" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        {err ? <p className="ago-err" role="alert">{err}</p> : null}
      </div>
    </Dialog>
  );
}

export function TasksDialog({ t, locale, open, onClose, tasks, loading, prompts, onCreate, onUpdate, onDelete, onRun, onOpenPlan }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (open) {
      setDraft(null);
      setErr("");
    }
  }, [open]);
  const wrap = (fn) => async (...args) => {
    setBusy(true);
    setErr("");
    try {
      await fn(...args);
    } catch (e) {
      setErr(e?.message || t("agentOps.err.generic"));
    } finally {
      setBusy(false);
    }
  };
  const create = wrap(async () => {
    if (!draft.title.trim() || !draft.prompt.trim()) throw new Error(t("agentOps.err.BAD_TASK"));
    await onCreate(draft);
    setDraft(null);
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      wide
      icon="clock"
      title={t("agentOps.tasks.title")}
      subtitle={t("agentOps.tasks.lead")}
      closeLabel={t("agentOps.close")}
      footer={draft ? (
        <>
          <button type="button" className="ago-btn" onClick={() => setDraft(null)} disabled={busy}>{t("agentOps.cancel")}</button>
          <button type="button" className="ago-btn is-p" onClick={create} disabled={busy}><Ic name="clock" size={15} />{t("agentOps.tasks.create")}</button>
        </>
      ) : (
        <>
          <button type="button" className="ago-btn" onClick={onClose}>{t("agentOps.close")}</button>
          <button type="button" className="ago-btn is-p" onClick={() => setDraft(blankTask())}><Ic name="plus" size={15} />{t("agentOps.tasks.new")}</button>
        </>
      )}
    >
      {draft ? (
        <TaskFields t={t} value={draft} onChange={setDraft} prompts={prompts} />
      ) : (
        <div className="ago-tasks">
          {loading && !tasks ? [0, 1, 2].map((k) => <div key={k} className="ago-skel" style={{ height: 64 }} />) : null}
          {tasks && !tasks.length ? <p className="ago-muted ago-pad">{t("agentOps.tasks.empty")}</p> : null}
          {(tasks || []).map((task) => (
            <div key={task.id} className={`ago-task${task.enabled ? "" : " is-off"}`}>
              <span className="ago-task-ic"><Ic name="clock" size={16} /></span>
              <div className="ago-col ago-task-main">
                <b className="ago-ellip">{task.title}</b>
                <small className="ago-ellip">{task.prompt}</small>
                <span className="ago-task-meta">
                  <span className="ago-sg is-bl">
                    {t(`agentOps.tasks.ev.${task.every}`)}
                    {task.every === "weekly" && task.weekday != null ? ` · ${t(`agentOps.tasks.wd.${task.weekday}`)}` : ""}
                    {task.every === "daily" || task.every === "weekly" ? ` · ${minutesToClock(task.atMinute)}` : ""}
                  </span>
                  {task.enabled && task.nextRunAt ? <span className="ago-sub">{t("agentOps.tasks.next", { when: when(task.nextRunAt, locale) })}</span> : null}
                  <span className="ago-sub">{task.lastRunAt ? t("agentOps.tasks.last", { when: when(task.lastRunAt, locale) }) : t("agentOps.tasks.never")}</span>
                  {task.lastStatus ? <span className={`ago-sg is-${task.lastStatus === "plan" ? "am" : task.lastStatus === "ok" ? "gr" : "hot"}`}>{t(`agentOps.tasks.st.${task.lastStatus}`)}</span> : null}
                  <span className="ago-sub">{t("agentOps.tasks.by", { name: task.adminUsername || "" })}</span>
                </span>
              </div>
              <div className="ago-task-acts">
                {task.lastPlanId ? <button type="button" className="ago-lnk" onClick={() => { onClose(); onOpenPlan(task.lastPlanId); }}>{t("agentOps.tasks.openPlan")}</button> : null}
                {task.mine ? (
                  <>
                    <button type="button" className="ago-btn is-s is-ghost" disabled={busy} onClick={wrap(() => onRun(task.id))}><Ic name="play" size={14} />{t("agentOps.tasks.runNow")}</button>
                    <Switch on={task.enabled} disabled={busy} label={t("agentOps.tasks.toggle")} onChange={wrap((on) => onUpdate(task.id, { enabled: on }))} />
                    <button type="button" className="ago-iconbtn is-s" disabled={busy} aria-label={t("agentOps.delete")} title={t("agentOps.delete")} onClick={wrap(() => onDelete(task.id))}><Ic name="trash" size={14} /></button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {err ? <p className="ago-err" role="alert">{err}</p> : null}
    </Dialog>
  );
}
