import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Check,
  RefreshCw,
  Share2,
  RotateCcw,
  Pencil,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  FileText,
} from "lucide-react";
import DimaMarkdownView from "./DimaMarkdownView";
import DimaPendingActionCard from "./DimaPendingActionCard";
import { stripAgentDraftChrome } from "./stripAgentDraft";
import { collapsePendingActions } from "./pendingActions";
import { formatBytes } from "./historyUtils";

function stripAttachedExtract(content) {
  return String(content || "")
    .replace(/\[Attached[^\]]*\](?:\s*\n---\n[\s\S]*?\n---)?/g, "")
    .replace(/\n?---\s*$/g, "")
    .trim();
}


function stripLeakedThought(content, thought) {
  let out = String(content || "");
  // Closed + still-open <think> blocks (streaming leak into answer)
  out = out.replace(/<think\b[^>]*>[\s\S]*?(?:<\/think>|$)/gi, "");
  out = out.replace(/<\/?think\b[^>]*>/gi, "");
  out = out.replace(/```(?:thinking|thought)\n[\s\S]*?(?:```|$)/gi, "");
  const th = String(thought || "").trim();
  if (th && out.includes(th)) {
    out = out.split(th).join("");
  }
  return out.replace(/^\n+|\n+$/g, "").trimEnd();
}

function ThinkingPanel({ text, streaming, locale, labels }) {
  const hasText = Boolean(String(text || "").trim());
  // Open while streaming; collapse after done if we have thought text.
  const [open, setOpen] = useState(Boolean(streaming));
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (streaming) {
      setOpen(true);
      wasStreaming.current = true;
    } else if (wasStreaming.current && hasText) {
      setOpen(false);
      wasStreaming.current = false;
    }
  }, [streaming, hasText]);

  if (!hasText && !streaming) return null;

  const title = hasText
    ? open
      ? labels.thinking
      : labels.thinkingShow || labels.thinking
    : labels.thinkingBusy;

  return (
    <div className={`dima-thinking${streaming ? " is-streaming" : ""}`}>
      <button
        type="button"
        className="dima-thinking-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="dima-thinking-title">{title}</span>
        {streaming && (
          <span className="dima-thinking-dots" aria-hidden="true">
            <i /><i /><i />
          </span>
        )}
      </button>
      {open && (
        <div className="dima-thinking-body" lang={locale?.startsWith("tr") ? "tr" : "en"}>
          {hasText ? text : (labels.thinkingBusy || "…")}
        </div>
      )}
    </div>
  );
}

function Citations({ items, label }) {
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <div className="dima-citations">
      <div className="dima-citations-label">{label}</div>
      <ul>
        {items.map((c, i) => (
          <li key={`${c.url || c.title}-${i}`}>
            <a href={c.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={12} />
              <span>{c.title || c.url}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttachmentChips({ items }) {
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <div className="dima-msg-files">
      {items.map((a) => (
        <div key={a.id || a.name} className="dima-file-chip is-static">
          {a.kind === "image" && a.previewUrl ? (
            <img src={a.previewUrl} alt="" className="dima-file-thumb" />
          ) : a.kind === "image" ? (
            <ImageIcon size={14} />
          ) : (
            <FileText size={14} />
          )}
          <span className="dima-file-meta">
            <strong>{a.name}</strong>
            <em>{formatBytes(a.size)}</em>
          </span>
        </div>
      ))}
    </div>
  );
}

export function DimaBubble({
  message,
  onCopy,
  onRegenerate,
  onRetry,
  onShare,
  onEdit,
  canRegenerate,
  canRetry,
  canEdit,
  copiedId,
  youLabel,
  labels,
  locale,
  onConfirmAction,
  onRejectAction,
  actionBusyId,
}) {
  const isUser = message.role === "user";
  const raw = String(message.content || "");
  const citations = message.citations || message.meta?.citations;
  const files = message.meta?.attachments || message.attachments;
  const thoughtText = message.thought || message.meta?.thought || "";
  const pendingActions = collapsePendingActions(
    message.pendingActions || message.meta?.pendingActions || [],
  );
  const visibleMarkdown = stripAgentDraftChrome(stripLeakedThought(raw, thoughtText), {
    hasPendingCard: pendingActions.length > 0,
  });
  const hasVisible = Boolean(visibleMarkdown.trim()) || pendingActions.length > 0;
  const isEmptyAssistant = !isUser && !hasVisible && (message.streaming || message.thinking) && !message.stopped;

  const actions = !message.streaming ? (
    <div className="dima-msg-actions">
      <button type="button" className="dima-icon-btn" onClick={() => onCopy(message)} aria-label={labels.copy} title={labels.copy}>
        {copiedId === (message.id || message._tmp) ? <Check size={14} /> : <Copy size={14} />}
      </button>
      {!isUser && canRegenerate && (
        <button type="button" className="dima-icon-btn" onClick={onRegenerate} aria-label={labels.regenerate} title={labels.regenerate}>
          <RefreshCw size={14} />
        </button>
      )}
      {!isUser && canRetry && (
        <button type="button" className="dima-icon-btn" onClick={onRetry} aria-label={labels.retry} title={labels.retry}>
          <RotateCcw size={14} />
        </button>
      )}
      {!isUser && (
        <button type="button" className="dima-icon-btn" onClick={() => onShare(message)} aria-label={labels.share} title={labels.share}>
          <Share2 size={14} />
        </button>
      )}
      {isUser && canEdit && (
        <button type="button" className="dima-icon-btn" onClick={() => onEdit(message)} aria-label={labels.edit} title={labels.edit}>
          <Pencil size={14} />
        </button>
      )}
    </div>
  ) : null;

  if (isUser) {
    const visibleUserText = stripAttachedExtract(raw);
    return (
      <article className={`dima-msg is-user${message.streaming ? " is-streaming" : ""}`}>
        <div className="dima-msg-label">{youLabel}</div>
        <AttachmentChips items={files} />
        {visibleUserText ? <div className="dima-msg-body">{visibleUserText}</div> : null}
        {actions}
      </article>
    );
  }

  // Thinking stays in its own thin panel — never mixed into the answer bubble.
  const showThinking = Boolean(thoughtText) || (Boolean(message.streaming) && !raw.trim());
  return (
    <div className={`dima-turn is-assistant${message.streaming ? " is-streaming" : ""}`}>
      {showThinking && (
        <ThinkingPanel
          text={thoughtText}
          streaming={Boolean(message.streaming) && !raw.trim()}
          locale={locale}
          labels={labels}
        />
      )}
      {!isEmptyAssistant && (
        <article className={`dima-msg is-assistant${message.streaming ? " is-streaming" : ""}`}>
          <div className="dima-msg-label">{labels.assistant || "Dima"}</div>
          {pendingActions.length ? (
            <div className="dima-agent-stack">
              {pendingActions.map((action) => (
                <DimaPendingActionCard
                  key={action.id}
                  action={action}
                  labels={labels}
                  busy={actionBusyId === action.id}
                  onConfirm={onConfirmAction}
                  onReject={onRejectAction}
                />
              ))}
            </div>
          ) : null}
          {visibleMarkdown.trim() || (message.streaming && !pendingActions.length) ? (
          <div className={`dima-stream-body${message.streaming ? " is-live" : ""}`}>
            {visibleMarkdown.trim() ? (
              <DimaMarkdownView
                markdown={visibleMarkdown}
                copyLabel={labels.copyCode}
                downloadLabel={labels.downloadCode}
                copiedLabel={labels.copied}
                streaming={Boolean(message.streaming)}
                labels={labels}
              />
            ) : null}
            {message.streaming && !pendingActions.length ? <span className="dima-stream-caret" aria-hidden="true" /> : null}
          </div>
          ) : null}
          <Citations items={citations} label={labels.sources} />
          {message.stopped && !message.streaming && (
            <div className="dima-stopped-badge" role="status">
              {labels.stopped || "Stopped"}
            </div>
          )}
          {actions}
        </article>
      )}
      {isEmptyAssistant && message.stopped && !message.streaming && !thoughtText && !pendingActions.length && (
        <div className="dima-stopped-empty muted">{labels.stopped || "Stopped"}</div>
      )}
    </div>
  );
}
