/* Yönetici Paneli > Ajan (phase 1, 2026-11-08): a Claude assistant that reads the panel's
 * data with the admin's own permissions and answers questions. Read only for now. The
 * answer streams in (Server-Sent Events from POST /admin/agent/chat); the tools it used
 * show as chips. The owner can switch it off and set the monthly budget. */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { API_BASE_URL } from "../../config/api";
import { getToken } from "../../lib/storage";
import { adminFetch } from "../../api/adminHttp";
import { requestStepUp, stepUpHeaders } from "../../lib/adminStepUp";
import { parseBlocks, parseInline, parseSse } from "./agentMarkdown.js";
import { Bot, Plus, Send, Trash2, ShieldCheck } from "../ui/Icon.jsx";
import "./AdminAgent.css";

function Inline({ text }) {
  return parseInline(text).map((p, i) =>
    p.t === "bold" ? <strong key={i}>{p.v}</strong> : p.t === "code" ? <code key={i}>{p.v}</code> : <Fragment key={i}>{p.v}</Fragment>,
  );
}

function Answer({ text }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="agx-md">
      {blocks.map((b, i) => {
        if (b.type === "h") return <h4 key={i}><Inline text={b.text} /></h4>;
        if (b.type === "ul") return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>;
        if (b.type === "ol") return <ol key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ol>;
        if (b.type === "code") return <pre key={i}><code>{b.text}</code></pre>;
        if (b.type === "table") {
          return (
            <div key={i} className="agx-table-wrap">
              <table className="agx-table">
                <thead><tr>{b.head.map((c, j) => <th key={j}><Inline text={c} /></th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}><Inline text={c} /></td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        return <p key={i}><Inline text={b.text} /></p>;
      })}
    </div>
  );
}

const ERROR_KEY = {
  AGENT_NO_KEY: "agentx.err.noKey",
  AGENT_DISABLED: "agentx.err.disabled",
  AGENT_BUDGET: "agentx.err.budget",
  NO_THREAD: "agentx.err.noThread",
  TOO_LONG: "agentx.err.tooLong",
  RATE_LIMITED: "agentx.err.rateLimited",
  OWNER_ONLY: "agentx.err.ownerOnly",
  BAD_BUDGET: "agentx.err.badBudget",
};
/** A failed panel call: the translated text for its code, else a generic line. */
const errText = (t, e) => (ERROR_KEY[e?.code] ? t(ERROR_KEY[e.code]) : t("agentx.err.generic"));
const NOTICE_KEY = {
  refusal: "agentx.notice.refusal",
  max_tokens: "agentx.notice.maxTokens",
  too_many_steps: "agentx.notice.tooManySteps",
  budget: "agentx.notice.budget",
};
const SUGGESTIONS = ["agentx.s1", "agentx.s2", "agentx.s3", "agentx.s4", "agentx.s5"];

export default function AdminAgent() {
  const t = useT();
  const [status, setStatus] = useState(null);
  const [threads, setThreads] = useState([]);
  const [threadId, setThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stepUp, setStepUp] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await adminFetch("/agent/status");
      setStatus(s);
      setBudgetDraft(String(s.budgetUsd));
    } catch (e) {
      setError(errText(t, e));
    }
  }, []);
  const loadThreads = useCallback(async () => {
    try {
      const r = await adminFetch("/agent/threads");
      setThreads(r.threads || []);
    } catch { /* list stays as is */ }
  }, []);

  useEffect(() => { loadStatus(); loadThreads(); }, [loadStatus, loadThreads]);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const openThread = async (id) => {
    if (busy) return;
    setError("");
    setStepUp(false);
    try {
      const r = await adminFetch(`/agent/threads/${id}`);
      setThreadId(id);
      setMessages(r.messages || []);
    } catch (e) {
      setError(errText(t, e));
    }
  };

  const newChat = () => {
    if (busy) return;
    setThreadId(null);
    setMessages([]);
    setError("");
    setStepUp(false);
    inputRef.current?.focus();
  };

  const removeThread = async (id) => {
    try {
      await adminFetch(`/agent/threads/${id}`, { method: "DELETE" });
      if (id === threadId) newChat();
      loadThreads();
    } catch (e) {
      setError(errText(t, e));
    }
  };

  const send = async (textArg) => {
    const text = String(textArg ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setError("");
    setStepUp(false);
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: "", tools: [], live: true }]);
    const patchLast = (fn) => setMessages((m) => {
      const copy = [...m];
      copy[copy.length - 1] = fn({ ...copy[copy.length - 1] });
      return copy;
    });
    try {
      const res = await fetch(`${API_BASE_URL}/admin/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json", ...stepUpHeaders() },
        body: JSON.stringify({ message: text, threadId }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { code: body.code });
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const [events, rest] = parseSse(buf);
        buf = rest;
        for (const ev of events) {
          if (ev.type === "thread") setThreadId(ev.threadId);
          else if (ev.type === "text") patchLast((m) => ({ ...m, text: m.text + ev.delta }));
          else if (ev.type === "tool" && ev.status === "start") patchLast((m) => ({ ...m, tools: [...m.tools, { id: ev.id, name: ev.name, status: "start" }] }));
          else if (ev.type === "tool") patchLast((m) => ({ ...m, tools: m.tools.map((x) => (x.id === ev.id ? { ...x, status: ev.status } : x)) }));
          else if (ev.type === "step_up_required") setStepUp(true);
          else if (ev.type === "notice") patchLast((m) => ({ ...m, notice: NOTICE_KEY[ev.code] || "" }));
          else if (ev.type === "done") {
            patchLast((m) => ({ ...m, live: false, costUsd: ev.costUsd }));
            setStatus((s) => (s ? { ...s, spentUsd: ev.monthSpentUsd } : s));
          } else if (ev.type === "error") {
            throw Object.assign(new Error(ev.message), { code: ev.code });
          }
        }
      }
    } catch (e) {
      setError(errText(t, e));
      patchLast((m) => ({ ...m, live: false }));
      if (e.code === "AGENT_DISABLED" || e.code === "AGENT_BUDGET" || e.code === "AGENT_NO_KEY") loadStatus();
    } finally {
      setBusy(false);
      setMessages((m) => m.filter((x, i) => !(i === m.length - 1 && x.role === "assistant" && !x.text && !x.tools?.length && !x.live)));
      loadThreads();
    }
  };

  const verify = async () => {
    try {
      await requestStepUp();
      setStepUp(false);
      setSavedNote(t("agentx.stepUpDone"));
    } catch { /* cancelled */ }
  };

  const saveSettings = async (patch) => {
    setSavedNote("");
    try {
      const r = await adminFetch("/agent/settings", { method: "PUT", body: JSON.stringify(patch) });
      setStatus((s) => ({ ...s, enabled: r.enabled, budgetUsd: r.budgetUsd }));
      setBudgetDraft(String(r.budgetUsd));
      setSavedNote(t("agentx.saved"));
    } catch (e) {
      setError(errText(t, e));
    }
  };

  const blocked = status && (!status.keyConfigured || !status.enabled || status.tablesMissing || status.spentUsd >= status.budgetUsd);
  const blockedText = !status ? "" : status.tablesMissing ? t("agentx.err.tables")
    : !status.keyConfigured ? t("agentx.err.noKey")
      : !status.enabled ? t("agentx.err.disabled")
        : status.spentUsd >= status.budgetUsd ? t("agentx.err.budget") : "";
  const pct = status ? Math.min(100, (status.spentUsd / Math.max(0.01, status.budgetUsd)) * 100) : 0;

  return (
    <section className="agx" aria-label={t("agentx.title")}>
      <aside className="agx-side">
        <button type="button" className="agx-new" onClick={newChat} disabled={busy}>
          <Plus size={16} aria-hidden="true" /> {t("agentx.newChat")}
        </button>
        <div className="agx-side-label">{t("agentx.history")}</div>
        <div className="agx-threads">
          {threads.length === 0 && <p className="agx-muted">{t("agentx.noThreads")}</p>}
          {threads.map((th) => (
            <div key={th.id} className={`agx-thread${th.id === threadId ? " is-active" : ""}`}>
              <button type="button" className="agx-thread-open" onClick={() => openThread(th.id)} title={th.title || ""}>
                {th.title || t("agentx.untitled")}
              </button>
              <button type="button" className="agx-icon-btn" onClick={() => removeThread(th.id)} aria-label={t("agentx.deleteThread")} title={t("agentx.deleteThread")}>
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        {status && (
          <div className="agx-meter">
            <div className="agx-meter-row">
              <span>{t("agentx.spent", { spent: status.spentUsd.toFixed(2), budget: Number(status.budgetUsd).toFixed(0) })}</span>
            </div>
            <div className="agx-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
              <i style={{ width: `${pct}%` }} className={pct >= 80 ? "is-high" : ""} />
            </div>
            {status.owner && (
              <div className="agx-owner">
                <button type="button" className={`agx-switch${status.enabled ? " is-on" : ""}`} onClick={() => saveSettings({ enabled: !status.enabled })}>
                  {status.enabled ? t("agentx.turnOff") : t("agentx.turnOn")}
                </button>
                <label className="agx-budget">
                  <span>{t("agentx.budgetLabel")}</span>
                  <input id="agx-budget" type="number" min="0" max="10000" step="5" value={budgetDraft} onChange={(e) => setBudgetDraft(e.target.value)} />
                </label>
                <button type="button" className="agx-save" onClick={() => saveSettings({ budgetUsd: Number(budgetDraft) })}>{t("agentx.save")}</button>
              </div>
            )}
            {savedNote && <p className="agx-muted" role="status">{savedNote}</p>}
          </div>
        )}
      </aside>

      <div className="agx-main">
        <header className="agx-head">
          <span className="agx-avatar" aria-hidden="true"><Bot size={20} /></span>
          <div>
            <h3>{t("agentx.title")}</h3>
            <p className="agx-muted">{t("agentx.phase1")}</p>
          </div>
        </header>

        <div className="agx-list" ref={listRef} aria-live="polite">
          {messages.length === 0 && (
            <div className="agx-empty">
              <p>{t("agentx.suggestTitle")}</p>
              <div className="agx-suggest">
                {SUGGESTIONS.map((k) => (
                  <button key={k} type="button" onClick={() => send(t(k))} disabled={busy || blocked}>{t(k)}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`agx-msg agx-${m.role}`}>
              {m.role === "assistant" && m.tools?.length > 0 && (
                <div className="agx-tools" aria-label={t("agentx.toolsUsed")}>
                  {m.tools.map((tool, j) => (
                    <span key={tool.id || j} className={`agx-chip is-${tool.status || "done"}`}>{t(`agentx.tool.${tool.name}`)}</span>
                  ))}
                </div>
              )}
              {m.role === "assistant"
                ? (m.text ? <Answer text={m.text} /> : m.live ? <p className="agx-muted agx-thinking">{t("agentx.thinking")}</p> : null)
                : <p className="agx-user-text">{m.text}</p>}
              {m.notice && <p className="agx-notice">{t(m.notice)}</p>}
              {m.role === "assistant" && m.costUsd != null && <span className="agx-cost">{t("agentx.cost", { cost: m.costUsd.toFixed(3) })}</span>}
            </div>
          ))}
        </div>

        {stepUp && (
          <div className="agx-stepup" role="alert">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>{t("agentx.stepUp")}</span>
            <button type="button" onClick={verify}>{t("agentx.stepUpBtn")}</button>
          </div>
        )}
        {(error || blockedText) && <p className="agx-error" role="alert">{error || blockedText}</p>}

        <form className="agx-compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea
            id="agx-input"
            ref={inputRef}
            rows={2}
            value={input}
            maxLength={8000}
            placeholder={t("agentx.placeholder")}
            aria-label={t("agentx.placeholder")}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            disabled={Boolean(blocked)}
          />
          <button type="submit" className="agx-send" disabled={busy || !input.trim() || Boolean(blocked)} aria-label={t("agentx.send")}>
            <Send size={16} aria-hidden="true" />
          </button>
        </form>
      </div>
    </section>
  );
}
