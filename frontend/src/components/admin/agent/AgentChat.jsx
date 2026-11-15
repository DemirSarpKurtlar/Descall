/* Ajan > Operasyon modu: the chat column (Taslak B, left panel). */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { parseBlocks, parseInline } from "../agentMarkdown.js";
import { AgentMark, Ic } from "./agentUi.jsx";
import { actionLabelParts, diffChips, joinLabel, planCode, toolChips } from "./agentOpsModel.js";

function Inline({ text }) {
  return parseInline(text).map((p, i) =>
    p.t === "bold" ? <strong key={i}>{p.v}</strong> : p.t === "code" ? <code key={i}>{p.v}</code> : <Fragment key={i}>{p.v}</Fragment>,
  );
}

function Answer({ text }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="ago-md">
      {blocks.map((b, i) => {
        if (b.type === "h") return <h4 key={i}><Inline text={b.text} /></h4>;
        if (b.type === "ul") return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>;
        if (b.type === "ol") return <ol key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ol>;
        if (b.type === "code") return <pre key={i}><code>{b.text}</code></pre>;
        if (b.type === "table") {
          return (
            <div key={i} className="ago-md-table">
              <table>
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

function toolLabel(t, name) {
  const own = t(`agentOps.tool.${name}`);
  if (own && own !== `agentOps.tool.${name}`) return own;
  const k = `agentx.tool.${name}`;
  const v = t(k);
  return v && v !== k ? v : name;
}

export default function AgentChat({
  t, threads, threadId, threadTitle, messages, busy, error, onSend, onOpenThread, onNewChat, onDeleteThread,
  suggestions, prompts, onUsePrompt, scopeOn, scopeTotal, onOpenScopes, scopesBtnRef, stepUp, onVerify, mode, onOpenPlan,
  catText, blockedText,
}) {
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const historyRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!historyOpen) return undefined;
    const onDown = (e) => { if (!historyRef.current?.contains(e.target)) setHistoryOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setHistoryOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [historyOpen]);

  const slash = input.startsWith("/") ? input.slice(1).toLocaleLowerCase("tr-TR") : null;
  const slashList = useMemo(
    () => (slash == null ? [] : (prompts || []).filter((p) => `${p.title} ${p.prompt}`.toLocaleLowerCase("tr-TR").includes(slash)).slice(0, 6)),
    [slash, prompts],
  );
  useEffect(() => setSlashIndex(0), [slash]);

  const send = (text) => {
    const value = String(text ?? input).trim();
    if (!value || busy || blockedText) return;
    setInput("");
    onSend(value);
  };
  const pickPrompt = (p) => {
    setInput(p.prompt);
    onUsePrompt?.(p);
    inputRef.current?.focus();
  };
  const actionText = (a, p) => joinLabel(actionLabelParts(a, p, catText).slice(0, 1), t);

  return (
    <section className="ago-chat ago-panel" aria-label={t("agentOps.chat.title")}>
      <header className="ago-chat-head">
        <span className="ago-h2">{t("agentOps.chat.title")}</span>
        {threadTitle ? <span className="ago-sub ago-ellip">· {threadTitle}</span> : null}
        <span className="ago-sp" />
        <button type="button" ref={scopesBtnRef} className="ago-sg is-gr ago-chip-btn" onClick={onOpenScopes}>
          <Ic name="key" size={12} />
          {t("agentOps.scopesChip", { on: scopeOn, total: scopeTotal })}
        </button>
        <div className="ago-pop-anchor" ref={historyRef}>
          <button type="button" className="ago-lnk" aria-expanded={historyOpen} aria-haspopup="menu" onClick={() => setHistoryOpen((v) => !v)}>
            {t("agentOps.chat.history")}
          </button>
          {historyOpen ? (
            <div className="ago-pop ago-hist-pop" role="menu" aria-label={t("agentOps.chat.historyTitle")}>
              <button type="button" role="menuitem" className="ago-hist-new" onClick={() => { setHistoryOpen(false); onNewChat(); }}>
                <Ic name="plus" size={14} />
                {t("agentOps.chat.newChat")}
              </button>
              <div className="ago-slab">{t("agentOps.chat.historyTitle")}</div>
              <div className="ago-hist-list">
                {threads.length === 0 ? <p className="ago-muted ago-pad">{t("agentOps.chat.noThreads")}</p> : null}
                {threads.map((th) => (
                  <div key={th.id} className={`ago-hist-row${th.id === threadId ? " is-on" : ""}`}>
                    <button type="button" role="menuitem" className="ago-hist-open" onClick={() => { setHistoryOpen(false); onOpenThread(th.id); }} title={th.title || ""}>
                      <span className="ago-ellip">{th.title || t("agentOps.chat.untitled")}</span>
                    </button>
                    <button type="button" className="ago-iconbtn is-s" onClick={() => onDeleteThread(th.id)} aria-label={t("agentOps.chat.deleteThread")} title={t("agentOps.chat.deleteThread")}>
                      <Ic name="trash" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <div className="ago-chat-list" ref={listRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="ago-chat-empty">
            <AgentMark />
            <b>{t("agentOps.chat.emptyTitle")}</b>
            <p>{t("agentOps.chat.emptyBody")}</p>
            <div className="ago-chat-starters">
              {["s1", "s2", "s3", "s4"].map((k) => (
                <button key={k} type="button" className="ago-fp" onClick={() => send(t(`agentOps.chat.${k}`))} disabled={busy || Boolean(blockedText)}>
                  {t(`agentOps.chat.${k}`)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ago-bub">{m.text}</div>
          ) : (
            <div key={i} className="ago-amsg">
              <AgentMark small />
              <div className="ago-amsg-body">
                {m.tools?.some((x) => x.name !== "propose_plan") ? (
                  <div className="ago-tools">
                    {toolChips(m.tools.filter((x) => x.name !== "propose_plan")).map((c, j) => (
                      <span key={j} className={`ago-tool is-${c.status}`}>
                        <Ic name={c.status === "start" ? "spin" : c.status === "error" ? "x" : "check"} size={12} className={c.status === "start" ? "ago-spinning" : undefined} />
                        {toolLabel(t, c.name)}
                        {c.count > 1 ? ` ×${c.count}` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
                {m.text ? <Answer text={m.text} /> : m.live ? <p className="ago-muted ago-thinking">{t("agentOps.chat.thinking")}</p> : null}
                {(m.plans || []).map((p) => {
                  const chips = diffChips(p.diff, actionText);
                  return (
                    <div key={p.planId} className="ago-plan-ref">
                      {chips.length ? (
                        <div className="ago-chips">
                          {chips.map((c, k) => <span key={k} className={`ago-sg is-${c.tone}`}>{t(c.key, c.vars)}</span>)}
                        </div>
                      ) : null}
                      <button type="button" className="ago-plan-open" onClick={() => onOpenPlan(p.planId)}>
                        <Ic name="shield" size={13} />
                        <span>{t("agentOps.chat.planReady", { code: planCode(p.code), count: p.count ?? 0 })}</span>
                        <span className="ago-lnk">{t("agentOps.chat.openPlan")}</span>
                      </button>
                    </div>
                  );
                })}
                {m.notice ? <p className="ago-notice">{t(m.notice)}</p> : null}
              </div>
            </div>
          ),
        )}
      </div>

      {stepUp ? (
        <div className="ago-stepup" role="alert">
          <Ic name="shield" size={15} />
          <span>{t("agentOps.chat.stepUp")}</span>
          <button type="button" className="ago-btn is-s" onClick={onVerify}>{t("agentOps.chat.stepUpBtn")}</button>
        </div>
      ) : null}
      {error || blockedText ? <p className="ago-err" role="alert">{error || blockedText}</p> : null}
      {mode === "read" ? <p className="ago-note">{t("agentOps.chat.readOnlyNote")}</p> : null}

      {suggestions?.length ? (
        <div className="ago-follow">
          {suggestions.map((s) => (
            <button key={s} type="button" className="ago-fp" onClick={() => send(s)} disabled={busy || Boolean(blockedText)}>{s}</button>
          ))}
        </div>
      ) : null}

      <form className="ago-compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {slash != null && slashList.length ? (
          <div className="ago-pop ago-slash" role="listbox" aria-label={t("agentOps.prompts.title")}>
            <div className="ago-slab">{t("agentOps.prompts.title")}</div>
            {slashList.map((p, k) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={k === slashIndex}
                className={`ago-slash-item${k === slashIndex ? " is-on" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); pickPrompt(p); }}
              >
                <Ic name="bm" size={13} />
                <span className="ago-ellip"><b>{p.title}</b> <small>{p.prompt}</small></span>
                {p.shared && !p.mine ? <em className="ago-sg">{t("agentOps.prompts.shared")}</em> : null}
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          maxLength={8000}
          placeholder={messages.length ? t("agentOps.chat.placeholder") : t("agentOps.chat.placeholderEmpty")}
          aria-label={t("agentOps.chat.placeholder")}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (slash != null && slashList.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => (i + 1) % slashList.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => (i - 1 + slashList.length) % slashList.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickPrompt(slashList[slashIndex]); return; }
              if (e.key === "Escape") { e.preventDefault(); setInput(""); return; }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
          }}
          disabled={Boolean(blockedText)}
        />
        {!input && !messages.length ? <span className="ago-kbd" aria-hidden="true">/</span> : null}
        <button type="submit" className="ago-sendb" disabled={busy || !input.trim() || Boolean(blockedText)} aria-label={t("agentOps.chat.send")}>
          <Ic name={busy ? "spin" : "send"} size={16} className={busy ? "ago-spinning" : undefined} />
        </button>
      </form>
    </section>
  );
}
