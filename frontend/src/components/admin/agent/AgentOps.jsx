/* Yönetici Paneli > Ajan, operasyon modu (owner pick "Taslak B · Plan paneli", 2026-11-15).
 * Left: the chat. Right: the plan panel with Plan / Kuyruk / Geçmiş / Kapsamlar.
 * The agent never changes anything by itself: it proposes a plan; an admin approves it
 * with a fresh 2FA code; the server applies it item by item (one per second), re-checking
 * every item, and keeps a 30-minute undo window. See backend lib/adminAgent/plans.js. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { requestStepUp } from "../../../lib/adminStepUp";
import BanDialog from "../BanDialog.jsx";
import { categoryLabel, loadModerationMeta } from "../moderationMeta.js";
import AgentChat from "./AgentChat.jsx";
import AgentPlan from "./AgentPlan.jsx";
import AgentQueue from "./AgentQueue.jsx";
import AgentHistory from "./AgentHistory.jsx";
import AgentScopesTab, { ScopesPopover } from "./AgentScopes.jsx";
import { SavePlanDialog, SchedulePlanDialog, TasksDialog } from "./AgentDialogs.jsx";
import { AgentMark, Ic, Switch, Toasts } from "./agentUi.jsx";
import { agentApi, streamChat } from "./agentApi.js";
import {
  MODES, MODE_KEY, TABS, banFormFromParams, isLive, normalizeMode, onCount, planCode, promptForPlan,
} from "./agentOpsModel.js";
import "./agentOps.css";

const NOTICE_KEY = {
  refusal: "agentx.notice.refusal",
  max_tokens: "agentx.notice.maxTokens",
  too_many_steps: "agentx.notice.tooManySteps",
  budget: "agentx.notice.budget",
};
const CHAT_ERR = {
  AGENT_NO_KEY: "agentx.err.noKey",
  AGENT_DISABLED: "agentx.err.disabled",
  AGENT_BUDGET: "agentx.err.budget",
  NO_THREAD: "agentx.err.noThread",
  TOO_LONG: "agentx.err.tooLong",
  RATE_LIMITED: "agentx.err.rateLimited",
  OWNER_ONLY: "agentx.err.ownerOnly",
  BAD_BUDGET: "agentx.err.badBudget",
};
const OPS_ERR = new Set([
  "PLAN_LOCKED", "NOTHING_TO_RUN", "NOTHING_TO_UNDO", "BAD_SCHEDULE", "STEP_UP_CANCELLED", "STEP_UP_REQUIRED", "OWNER_ONLY",
  "NOT_APPROVER", "DRY_RUN_REQUIRED", "BAD_TASK", "BAD_LIMIT", "ADMIN_PERMISSION_DENIED",
]);
const POLL_MS = 1200;

function readMode() {
  try {
    return normalizeMode(localStorage.getItem(MODE_KEY));
  } catch {
    return "dry";
  }
}

/** One plan's view, reloaded every POLL_MS while it is running, paused or scheduled. */
function usePlanView(id) {
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const idRef = useRef(id);
  idRef.current = id;
  const reload = useCallback(async () => {
    const want = idRef.current;
    if (!want) return null;
    try {
      const v = await agentApi.plan(want);
      if (idRef.current === want) {
        setView(v);
        setError(null);
      }
      return v;
    } catch (e) {
      if (idRef.current === want) setError(e);
      return null;
    }
  }, []);
  useEffect(() => {
    setView(null);
    setError(null);
    if (!id) return undefined;
    let alive = true;
    setLoading(true);
    reload().finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id, reload]);
  const live = isLive(view?.plan?.status);
  useEffect(() => {
    if (!id || !live) return undefined;
    const h = setInterval(() => { reload(); }, POLL_MS);
    return () => clearInterval(h);
  }, [id, live, reload]);
  return { view, setView, loading, error, reload };
}

function BudgetCard({ t, status, onSave }) {
  const [draft, setDraft] = useState("");
  useEffect(() => { if (status) setDraft(String(status.budgetUsd)); }, [status?.budgetUsd]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!status) return null;
  const pct = Math.min(100, (status.spentUsd / Math.max(0.01, status.budgetUsd)) * 100);
  return (
    <div className="ago-scopes-card ago-budget">
      <div className="ago-policy">
        <span className="ago-sub tnum">{t("agentx.spent", { spent: Number(status.spentUsd).toFixed(2), budget: Number(status.budgetUsd).toFixed(0) })}</span>
        <span className="ago-sp" />
        {status.owner ? <Switch on={status.enabled} label={status.enabled ? t("agentx.turnOff") : t("agentx.turnOn")} onChange={(on) => onSave({ enabled: on })} /> : null}
      </div>
      <div className="ago-pbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <i className={pct >= 80 ? "is-r" : "is-g"} style={{ width: `${pct}%` }} />
      </div>
      {status.owner ? (
        <div className="ago-policy">
          <label className="ago-limit is-wide">
            <span className="ago-sub">{t("agentx.budgetLabel")}</span>
            <input type="number" min={0} max={10000} step={5} value={draft} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <span className="ago-sp" />
          <button type="button" className="ago-btn is-s" onClick={() => onSave({ budgetUsd: Number(draft) })}>{t("agentx.save")}</button>
        </div>
      ) : null}
    </div>
  );
}

export default function AgentOps({ onOpenUser, onGoto }) {
  const { t, locale } = useLocale();
  const [status, setStatus] = useState(null);
  const [scopes, setScopes] = useState(null);
  const [scopesLoading, setScopesLoading] = useState(true);
  const [scopesSaving, setScopesSaving] = useState(false);
  const [mode, setModeState] = useState(readMode);
  const [tab, setTab] = useState("plan");
  const [threads, setThreads] = useState([]);
  const [threadId, setThreadId] = useState(null);
  const [threadTitle, setThreadTitle] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const [stepUp, setStepUp] = useState(false);
  const [planId, setPlanId] = useState(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [queueList, setQueueList] = useState([]);
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState("");
  const [prompts, setPrompts] = useState([]);
  const [tasks, setTasks] = useState(null);
  const [meta, setMeta] = useState(null);
  const [banEdit, setBanEdit] = useState(null);
  const [savePlanOpen, setSavePlanOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [scopesAnchor, setScopesAnchor] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const headScopesRef = useRef(null);
  const chatScopesRef = useRef(null);
  const tabRefs = useRef({});

  const planState = usePlanView(planId);
  const planView = planState.view;
  const focusedExecuted = planView && !["proposed", "superseded", "discarded"].includes(planView.plan.status);
  const queueId = focusedExecuted ? planView.plan.id : queueList[0]?.id || null;
  const otherQueue = usePlanView(queueId && queueId !== planId ? queueId : null);
  const queueView = queueId && queueId === planId ? planView : otherQueue.view;

  const toast = useCallback((text, tone = "ok", extra = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((list) => [...list.slice(-2), { id, text, tone, closeLabel: t("agentOps.close"), ...extra }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), extra.ttl || 5000);
  }, [t]);
  const opsError = useCallback((e) => {
    if (e?.code === "TABLES_MISSING") return t("agentOps.err.tables");
    if (OPS_ERR.has(e?.code)) return t(`agentOps.err.${e.code}`);
    return e?.message || t("agentOps.err.generic");
  }, [t]);

  const catText = useCallback((id, otherText) => (id === "other" && otherText ? otherText : categoryLabel(id, meta?.categories || [], t) || id), [meta, t]);

  /* ---------- loading ---------- */
  const loadStatus = useCallback(() => agentApi.status().then(setStatus).catch(() => {}), []);
  const loadThreads = useCallback(() => agentApi.threads().then((r) => setThreads(r.threads || [])).catch(() => {}), []);
  const loadScopes = useCallback(() => agentApi.scopes().then(setScopes).catch(() => {}).finally(() => setScopesLoading(false)), []);
  const loadQueue = useCallback(() => agentApi.plans({ view: "queue" }).then((r) => setQueueList(r.plans || [])).catch(() => {}), []);
  const loadHistory = useCallback(() => agentApi.plans().then((r) => { setHistory(r.plans || []); setHistoryError(""); }).catch((e) => setHistoryError(opsError(e))), [opsError]);
  const loadPrompts = useCallback(() => agentApi.prompts().then((r) => setPrompts(r.prompts || [])).catch(() => {}), []);
  const loadTasks = useCallback(() => agentApi.tasks().then((r) => setTasks(r.tasks || [])).catch(() => setTasks([])), []);

  useEffect(() => {
    loadStatus();
    loadThreads();
    loadScopes();
    loadQueue();
    loadPrompts();
    loadTasks();
    loadModerationMeta().then(setMeta).catch(() => {});
  }, [loadStatus, loadThreads, loadScopes, loadQueue, loadPrompts, loadTasks]);

  useEffect(() => {
    const h = setInterval(loadQueue, 8000);
    return () => clearInterval(h);
  }, [loadQueue]);
  useEffect(() => { if (tab === "history") loadHistory(); }, [tab, loadHistory]);
  const tickNeeded = Boolean(queueView?.plan?.undoUntil);
  useEffect(() => {
    if (!tickNeeded) return undefined;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [tickNeeded]);
  // A plan that finishes refreshes the live list.
  const queueStatus = queueView?.plan?.status;
  useEffect(() => { loadQueue(); }, [queueStatus, loadQueue]);
  // The Kuyruk tab always shows fresh rows (another admin may have approved the open plan).
  const reloadPlan = planState.reload;
  const reloadOther = otherQueue.reload;
  useEffect(() => {
    if (tab !== "queue") return;
    if (planId) reloadPlan();
    reloadOther();
  }, [tab, planId, reloadPlan, reloadOther]);
  const planIsLiveElsewhere = Boolean(planId && planView?.plan?.status === "proposed" && queueList.some((p) => p.id === planId));
  useEffect(() => { if (planIsLiveElsewhere) reloadPlan(); }, [planIsLiveElsewhere, reloadPlan]);

  const setMode = (m) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ }
  };

  /* ---------- chat ---------- */
  const attachPlans = (msgs, plans) => {
    const byTool = new Map(plans.filter((p) => p.toolUseId).map((p) => [p.toolUseId, p]));
    return msgs.map((m) => {
      if (m.role !== "assistant") return m;
      const refs = (m.tools || []).filter((x) => x.name === "propose_plan" && byTool.has(x.id)).map((x) => {
        const p = byTool.get(x.id);
        return { planId: p.id, code: p.code, version: p.version, diff: p.diff, count: p.selectedCount ?? p.itemCount };
      });
      return refs.length ? { ...m, plans: refs } : m;
    });
  };

  const openThread = async (id) => {
    if (chatBusy) return;
    setChatError("");
    setStepUp(false);
    try {
      const [r, p] = await Promise.all([agentApi.thread(id), agentApi.plans({ threadId: id }).catch(() => ({ plans: [] }))]);
      setThreadId(id);
      setThreadTitle(r.thread?.title || "");
      const plans = p.plans || [];
      setMessages(attachPlans(r.messages || [], plans));
      const focus = plans.find((x) => x.status !== "superseded") || plans[0];
      setPlanId(focus?.id || null);
      setShowDiff(false);
      if (focus) setTab(isLive(focus.status) || ["done", "failed", "cancelled"].includes(focus.status) ? "queue" : "plan");
    } catch (e) {
      setChatError(t(CHAT_ERR[e?.code] || "agentx.err.generic"));
    }
  };

  const newChat = () => {
    if (chatBusy) return;
    setThreadId(null);
    setThreadTitle("");
    setMessages([]);
    setChatError("");
    setStepUp(false);
    setPlanId(null);
    setTab("plan");
  };

  const deleteThread = async (id) => {
    try {
      await agentApi.deleteThread(id);
      if (id === threadId) newChat();
      loadThreads();
    } catch (e) {
      setChatError(t(CHAT_ERR[e?.code] || "agentx.err.generic"));
    }
  };

  const send = async (text) => {
    if (chatBusy) return;
    setChatError("");
    setStepUp(false);
    setChatBusy(true);
    setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: "", tools: [], live: true }]);
    if (!threadId) setThreadTitle(text.slice(0, 60));
    const patchLast = (fn) => setMessages((m) => {
      const copy = [...m];
      copy[copy.length - 1] = fn({ ...copy[copy.length - 1] });
      return copy;
    });
    const openPlan = planView?.plan?.status === "proposed" ? planView.plan.id : null;
    try {
      await streamChat({ message: text, threadId, planId: openPlan, mode }, (ev) => {
        if (ev.type === "thread") setThreadId(ev.threadId);
        else if (ev.type === "text") patchLast((m) => ({ ...m, text: m.text + ev.delta }));
        else if (ev.type === "tool" && ev.status === "start") patchLast((m) => ({ ...m, tools: [...m.tools, { id: ev.id, name: ev.name, status: "start" }] }));
        else if (ev.type === "tool") patchLast((m) => ({ ...m, tools: m.tools.map((x) => (x.id === ev.id ? { ...x, status: ev.status } : x)) }));
        else if (ev.type === "plan") {
          patchLast((m) => ({ ...m, plans: [...(m.plans || []), { planId: ev.planId, code: ev.code, version: ev.version, diff: ev.diff, count: ev.count }] }));
          setPlanId(ev.planId);
          setShowDiff(ev.version > 1);
          setTab("plan");
        } else if (ev.type === "step_up_required") setStepUp(true);
        else if (ev.type === "notice") patchLast((m) => ({ ...m, notice: NOTICE_KEY[ev.code] || "" }));
        else if (ev.type === "done") {
          patchLast((m) => ({ ...m, live: false, costUsd: ev.costUsd }));
          setStatus((s) => (s ? { ...s, spentUsd: ev.monthSpentUsd } : s));
        }
      });
    } catch (e) {
      setChatError(t(CHAT_ERR[e?.code] || "agentx.err.generic"));
      patchLast((m) => ({ ...m, live: false }));
      if (["AGENT_DISABLED", "AGENT_BUDGET", "AGENT_NO_KEY"].includes(e?.code)) loadStatus();
    } finally {
      setChatBusy(false);
      setMessages((m) => m.filter((x, i) => !(i === m.length - 1 && x.role === "assistant" && !x.text && !x.tools?.length && !x.plans?.length && !x.live)));
      loadThreads();
    }
  };

  const verify = async () => {
    try {
      await requestStepUp();
      setStepUp(false);
    } catch { /* cancelled */ }
  };

  /* ---------- plan actions ---------- */
  const runPlanOp = async (fn, { okText, after } = {}) => {
    setPlanBusy(true);
    try {
      const v = await fn();
      if (okText) toast(typeof okText === "function" ? okText(v) : okText);
      after?.(v);
      return v;
    } catch (e) {
      if (e?.code !== "STEP_UP_CANCELLED") toast(opsError(e), "bad");
      else toast(t("agentOps.err.STEP_UP_CANCELLED"), "bad");
      planState.reload();
      return null;
    } finally {
      setPlanBusy(false);
    }
  };

  const onSelect = async (itemIds, selected) => {
    if (!planId || !itemIds.length) return;
    const ids = new Set(itemIds);
    planState.setView((v) => (v ? { ...v, items: v.items.map((i) => (ids.has(i.id) ? { ...i, selected } : i)) } : v));
    try {
      planState.setView(await agentApi.select(planId, itemIds, selected));
    } catch (e) {
      toast(opsError(e), "bad");
      planState.reload();
    }
  };

  const switchToVersion = (v) => {
    if (!v?.plan) return;
    planState.setView(v);
    setPlanId(v.plan.id);
    setShowDiff(true);
  };

  const onEditTimeout = (group, presetId) =>
    runPlanOp(() => agentApi.edit(planId, { itemIds: group.items.map((i) => i.id), params: { ...group.params, presetId, durationSeconds: undefined } }), {
      okText: (v) => t("agentOps.toast.edited", { v: v.plan.version }),
      after: switchToVersion,
    });

  const onSaveBan = async (body) => {
    const v = await agentApi.edit(planId, { itemIds: banEdit.items.map((i) => i.id), action: "ban", params: body });
    switchToVersion(v);
    toast(t("agentOps.toast.edited", { v: v.plan.version }));
  };

  const approve = (scheduleAt = null) =>
    runPlanOp(() => agentApi.approve(planId, { mode, scheduleAt }), {
      okText: scheduleAt ? t("agentOps.toast.scheduled", { when: new Date(scheduleAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }) : t("agentOps.toast.approved"),
      after: (v) => {
        planState.setView(v);
        loadQueue();
        setTab("queue");
      },
    });

  const queueOp = async (op) => {
    const id = queueView?.plan?.id;
    if (!id) return;
    await runPlanOp(() => agentApi.op(id, op), {
      okText: t(`agentOps.toast.${op === "pause" ? "paused" : op === "resume" ? "resumed" : "cancelled"}`),
      after: (v) => {
        if (id === planId) planState.setView(v);
        else otherQueue.setView(v);
        loadQueue();
      },
    });
  };

  const undo = async (itemIds) => {
    const id = queueView?.plan?.id;
    if (!id) return;
    await runPlanOp(() => agentApi.undo(id, itemIds), {
      okText: (v) => t("agentOps.toast.undone", { count: v.undo?.undone || 0 }),
      after: (v) => {
        if (id === planId) planState.setView(v);
        else otherQueue.setView(v);
      },
    });
  };

  const openPlan = (id, preferQueue = false) => {
    setPlanId(id);
    setShowDiff(false);
    setTab(preferQueue ? "queue" : "plan");
  };

  const savePlan = async ({ title, prompt, shared, task }) => {
    await agentApi.createPrompt({ title, prompt, shared });
    if (task) await agentApi.createTask(task);
    loadPrompts();
    if (task) loadTasks();
    toast(task ? t("agentOps.toast.taskSaved") : t("agentOps.savePlan.saved"));
  };

  const patchScopes = async (patch) => {
    setScopesSaving(true);
    try {
      setScopes(await agentApi.saveScopes(patch));
      toast(t("agentOps.scopes.saved"));
    } catch (e) {
      toast(opsError(e), "bad");
    } finally {
      setScopesSaving(false);
    }
  };

  const saveSettings = async (patch) => {
    try {
      const r = await agentApi.saveSettings(patch);
      setStatus((s) => ({ ...s, enabled: r.enabled, budgetUsd: r.budgetUsd }));
      toast(t("agentx.saved"));
    } catch (e) {
      toast(t(CHAT_ERR[e?.code] || "agentx.err.generic"), "bad");
    }
  };

  /* ---------- derived ---------- */
  const blockedText = !status ? "" : status.tablesMissing ? t("agentx.err.tables")
    : !status.keyConfigured ? t("agentx.err.noKey")
      : !status.enabled ? t("agentx.err.disabled")
        : status.spentUsd >= status.budgetUsd ? t("agentx.err.budget") : "";
  const on = onCount(scopes?.scopes);
  const total = scopes?.total || 8;
  const scheduledCount = (tasks || []).filter((x) => x.enabled).length;
  const planCount = planView ? planView.items.filter((i) => i.status !== "excluded").length : 0;
  const liveCount = queueList.length;
  const suggestions = planView?.plan?.status === "proposed" ? planView.plan.suggestions || [] : [];
  const banTargets = useMemo(
    () => (banEdit?.items || []).map((i) => ({ id: i.userId, username: i.username, avatarUrl: i.target?.avatarUrl, isAdmin: i.target?.isAdmin })),
    [banEdit],
  );
  const savePrompt = useMemo(() => promptForPlan(messages, planId), [messages, planId]);

  const onTabKey = (e) => {
    const i = TABS.indexOf(tab);
    let next = null;
    if (e.key === "ArrowRight") next = TABS[(i + 1) % TABS.length];
    if (e.key === "ArrowLeft") next = TABS[(i - 1 + TABS.length) % TABS.length];
    if (e.key === "Home") next = TABS[0];
    if (e.key === "End") next = TABS[TABS.length - 1];
    if (next) {
      e.preventDefault();
      setTab(next);
      tabRefs.current[next]?.focus();
    }
  };

  const tabCount = { plan: planCount || null, queue: liveCount || null };
  const v = planView?.plan;

  return (
    <section className="ago-page" aria-label={t("agentOps.title")}>
      <header className="ago-top">
        <AgentMark />
        <div className="ago-col ago-top-t">
          <h1 className="ago-h2">{t("agentOps.title")}</h1>
          <span className="ago-sub">{t("agentOps.subtitle")}</span>
        </div>
        <span className="ago-sp" />
        <div className="ago-seg" role="radiogroup" aria-label={t("agentOps.mode.label")}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={`${mode === m ? "is-on" : ""}${mode === m && m === "dry" ? " is-am" : ""}`}
              title={t(`agentOps.mode.${m}Hint`)}
              onClick={() => setMode(m)}
            >
              <Ic name={m === "read" ? "eye" : m === "dry" ? "flask" : "zap"} size={16} />
              {t(`agentOps.mode.${m}`)}
            </button>
          ))}
        </div>
        <button type="button" ref={headScopesRef} className="ago-btn is-ghost is-s" aria-expanded={scopesAnchor === "head"} onClick={() => setScopesAnchor((a) => (a === "head" ? null : "head"))}>
          <Ic name="key" size={16} />
          {t("agentOps.scopesBtn", { on, total })}
        </button>
        <button type="button" className="ago-btn is-ghost is-s" onClick={() => { loadTasks(); setTasksOpen(true); }}>
          <Ic name="clock" size={16} />
          {t("agentOps.scheduledBtn", { count: scheduledCount })}
        </button>
      </header>

      <div className="ago-body">
        <AgentChat
          t={t}
          threads={threads}
          threadId={threadId}
          threadTitle={threadTitle}
          messages={messages}
          busy={chatBusy}
          error={chatError}
          blockedText={blockedText}
          onSend={send}
          onOpenThread={openThread}
          onNewChat={newChat}
          onDeleteThread={deleteThread}
          suggestions={suggestions}
          prompts={prompts}
          onUsePrompt={(p) => agentApi.usePrompt(p.id).catch(() => {})}
          scopeOn={on}
          scopeTotal={total}
          scopesBtnRef={chatScopesRef}
          onOpenScopes={() => setScopesAnchor((a) => (a === "chat" ? null : "chat"))}
          stepUp={stepUp}
          onVerify={verify}
          mode={mode}
          onOpenPlan={(id) => openPlan(id)}
          catText={catText}
        />

        <section className="ago-right ago-panel" aria-label={t("agentOps.tab.label")}>
          <div className="ago-tabs">
            <div className="ago-tablist" role="tablist" aria-label={t("agentOps.tab.label")} onKeyDown={onTabKey}>
              {TABS.map((id) => (
                <button
                  key={id}
                  ref={(el) => { tabRefs.current[id] = el; }}
                  type="button"
                  role="tab"
                  id={`ago-tab-${id}`}
                  aria-selected={tab === id}
                  aria-controls={`ago-panel-${id}`}
                  tabIndex={tab === id ? 0 : -1}
                  className={`ago-tab${tab === id ? " is-on" : ""}`}
                  onClick={() => setTab(id)}
                >
                  {t(`agentOps.tab.${id}`)}
                  {tabCount[id] ? <em className="tnum">{tabCount[id]}</em> : null}
                </button>
              ))}
            </div>
            <span className="ago-sp" />
            {v && tab === "plan" ? (
              <span className="ago-tabs-ver">
                <span className="ago-chip">{t("agentOps.version", { v: v.version })}</span>
                {v.version > 1 ? (
                  <button type="button" className="ago-lnk" aria-pressed={showDiff} onClick={() => setShowDiff((x) => !x)}>
                    <Ic name="diff" size={13} /> {showDiff ? t("agentOps.diff.hide") : t("agentOps.diff.show", { n: v.version - 1 })}
                  </button>
                ) : null}
              </span>
            ) : null}
          </div>

          <div className="ago-tabpanel" role="tabpanel" id={`ago-panel-${tab}`} aria-labelledby={`ago-tab-${tab}`}>
            {tab === "plan" ? (
              <AgentPlan
                t={t}
                view={planView}
                loading={planState.loading}
                error={planState.error ? opsError(planState.error) : ""}
                mode={mode}
                catText={catText}
                showDiff={showDiff}
                busy={planBusy}
                onRetry={planState.reload}
                onSelect={onSelect}
                onEditBan={(g) => setBanEdit(g)}
                onEditTimeout={onEditTimeout}
                onApprove={() => approve(null)}
                onSchedule={() => setScheduleOpen(true)}
                onSavePlan={() => setSavePlanOpen(true)}
                onDiscard={() => runPlanOp(() => agentApi.discard(planId), { okText: t("agentOps.toast.discarded"), after: (x) => planState.setView(x) })}
                onDryRun={() => runPlanOp(() => agentApi.dryRun(planId), { after: (x) => planState.setView(x) })}
                onOpenUser={onOpenUser}
                onOpenVersion={(id) => openPlan(id)}
                onGoQueue={() => setTab("queue")}
              />
            ) : null}
            {tab === "queue" ? (
              <AgentQueue
                t={t}
                locale={locale}
                view={queueView}
                others={queueList.filter((p) => p.id !== queueView?.plan?.id)}
                loading={(queueId === planId ? planState.loading : otherQueue.loading) && Boolean(queueId)}
                busy={planBusy}
                now={now}
                catText={catText}
                onOp={queueOp}
                onUndo={undo}
                onOpenPlan={(id) => openPlan(id, true)}
              />
            ) : null}
            {tab === "history" ? (
              <AgentHistory
                t={t}
                locale={locale}
                plans={history}
                loading={!history}
                error={historyError}
                onRetry={loadHistory}
                onOpenPlan={openPlan}
                onOpenAudit={onGoto ? () => onGoto("audit") : null}
              />
            ) : null}
            {tab === "scopes" ? (
              <div className="ago-scopes-wrap">
                <AgentScopesTab t={t} data={scopes} loading={scopesLoading} saving={scopesSaving} onPatch={patchScopes} />
                <BudgetCard t={t} status={status} onSave={saveSettings} />
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <ScopesPopover
        t={t}
        open={Boolean(scopesAnchor)}
        anchorRef={scopesAnchor === "chat" ? chatScopesRef : headScopesRef}
        onClose={() => setScopesAnchor(null)}
        data={scopes}
        saving={scopesSaving}
        onPatch={patchScopes}
      />

      <BanDialog
        open={Boolean(banEdit)}
        targets={banTargets}
        target={banTargets[0]}
        bulk={v ? { code: planCode(v.code), version: v.version } : null}
        initialForm={banEdit ? banFormFromParams(banEdit.params) : null}
        meta={meta || undefined}
        onSaveBulk={onSaveBan}
        onClose={() => setBanEdit(null)}
      />
      <SavePlanDialog
        t={t}
        open={savePlanOpen}
        onClose={() => setSavePlanOpen(false)}
        initialPrompt={savePrompt}
        initialTitle={v?.title || ""}
        prompts={prompts}
        onSave={savePlan}
      />
      <SchedulePlanDialog
        t={t}
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        planLabel={v ? `${t("agentOps.planRef", { code: planCode(v.code), v: v.version })} · ${v.title}` : ""}
        onConfirm={async (iso) => {
          const r = await approve(iso);
          if (!r) throw new Error(t("agentOps.err.generic"));
        }}
      />
      <TasksDialog
        t={t}
        locale={locale}
        open={tasksOpen}
        onClose={() => setTasksOpen(false)}
        tasks={tasks}
        loading={!tasks}
        prompts={prompts}
        onCreate={async (d) => { await agentApi.createTask(d); await loadTasks(); toast(t("agentOps.toast.taskSaved")); }}
        onUpdate={async (id, body) => { await agentApi.updateTask(id, body); await loadTasks(); }}
        onDelete={async (id) => { await agentApi.deleteTask(id); await loadTasks(); }}
        onRun={async (id) => { await agentApi.runTask(id); await loadTasks(); }}
        onOpenPlan={(id) => openPlan(id)}
      />
      <Toasts items={toasts} onDismiss={(id) => setToasts((list) => list.filter((x) => x.id !== id))} />
    </section>
  );
}
