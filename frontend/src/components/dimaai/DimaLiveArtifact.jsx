import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Code2, Copy, Download, Eye, Maximize2, Minimize2, Play, RotateCcw, Sparkles, Terminal } from "lucide-react";
import { highlight, extensionForLang } from "./dimaMarkdown";
import { isHtmlArtifact, isPythonArtifact, wrapHtmlPreview } from "./dimaArtifacts";
import { runDimaPython } from "../../api/dimaai";

function useCopied() {
  const [copied, setCopied] = useState(false);
  const onCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };
  return { copied, onCopy };
}

function downloadSnippet(code, ext) {
  try {
    const blob = new Blob([code || ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dima-snippet.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

function ArtifactChrome({
  kind,
  title,
  subtitle,
  tab,
  onTab,
  tabs,
  expanded,
  onToggleExpand,
  actions,
  children,
  labels,
}) {
  const frame = (
    <section className={`dima-artifact is-${kind}${expanded ? " is-expanded" : ""}`}>
      <header className="dima-artifact-head">
        <div className="dima-artifact-brand">
          <span className="dima-artifact-mark" aria-hidden>
            {kind === "python" ? <Terminal size={15} /> : <Sparkles size={15} />}
          </span>
          <div className="dima-artifact-copy">
            <strong>{title}</strong>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
        </div>
        <div className="dima-artifact-tabs" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`dima-artifact-tab${tab === item.id ? " is-active" : ""}`}
              onClick={() => onTab(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
        <div className="dima-artifact-tools">
          {actions}
          <button
            type="button"
            className="dima-code-btn"
            onClick={onToggleExpand}
            aria-label={expanded ? labels.shrink : labels.expand}
            title={expanded ? labels.shrink : labels.expand}
          >
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{expanded ? labels.shrink : labels.expand}</span>
          </button>
        </div>
      </header>
      <div className="dima-artifact-stage">{children}</div>
    </section>
  );

  if (!expanded || typeof document === "undefined") return frame;

  return createPortal(
    <div className="dima-artifact-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="dima-artifact-backdrop" aria-label={labels.shrink} onClick={onToggleExpand} />
      <div className="dima-artifact-overlay-card">{frame}</div>
    </div>,
    document.body,
  );
}

function CodePane({ lang, code }) {
  const html = useMemo(() => highlight(code, lang), [code, lang]);
  return (
    <pre className="dima-code dima-artifact-code" data-lang={lang || "text"}>
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

export function DimaHtmlArtifact({ lang, code, labels }) {
  const [tab, setTab] = useState("preview");
  const [expanded, setExpanded] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const { copied, onCopy } = useCopied();
  const srcDoc = useMemo(() => wrapHtmlPreview(code, lang), [code, lang]);
  const ext = extensionForLang(lang);

  useEffect(() => {
    setFrameReady(false);
    const id = window.setTimeout(() => setFrameReady(true), 0);
    return () => window.clearTimeout(id);
  }, [srcDoc]);

  return (
    <ArtifactChrome
      kind="html"
      title={labels.htmlLive}
      subtitle={labels.htmlLiveHint}
      tab={tab}
      onTab={setTab}
      tabs={[
        { id: "preview", label: labels.preview, icon: <Eye size={12} /> },
        { id: "code", label: labels.code, icon: <Code2 size={12} /> },
      ]}
      expanded={expanded}
      onToggleExpand={() => setExpanded((v) => !v)}
      labels={labels}
      actions={
        <>
          <button type="button" className="dima-code-btn" onClick={() => onCopy(code)} aria-label={labels.copy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? labels.copied : labels.copy}</span>
          </button>
          <button type="button" className="dima-code-btn" onClick={() => downloadSnippet(code, ext)} aria-label={labels.download}>
            <Download size={13} />
            <span>{labels.download}</span>
          </button>
        </>
      }
    >
      {tab === "code" ? (
        <CodePane lang={lang} code={code} />
      ) : frameReady ? (
        <iframe
          className="dima-artifact-frame"
          title={labels.htmlLive}
          sandbox="allow-scripts allow-forms allow-modals"
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
        />
      ) : (
        <div className="dima-artifact-frame dima-artifact-frame-pending" aria-busy="true" />
      )}
    </ArtifactChrome>
  );
}

export function DimaPythonArtifact({ lang, code, labels, streaming = false }) {
  const [tab, setTab] = useState("output");
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const ranFor = useRef("");
  const { copied, onCopy } = useCopied();
  const ext = extensionForLang(lang);

  const run = async () => {
    setRunning(true);
    setTab("output");
    try {
      const data = await runDimaPython(code);
      setResult(data);
      ranFor.current = code;
    } catch (err) {
      setResult({
        ok: false,
        stdout: "",
        stderr: err?.message || labels.pythonFailed,
      });
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (streaming) return undefined;
    if (!String(code || "").trim()) return undefined;
    if (ranFor.current === code) return undefined;
    run();
    return undefined;
    // Auto-run once a complete Python fence is in the reply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, code]);

  const empty = !result && !running;
  const out = String(result?.stdout || "").trim();
  const err = String(result?.stderr || "").trim();

  return (
    <ArtifactChrome
      kind="python"
      title={labels.pythonLive}
      subtitle={labels.pythonLiveHint}
      tab={tab}
      onTab={setTab}
      tabs={[
        { id: "output", label: labels.output, icon: <Terminal size={12} /> },
        { id: "code", label: labels.code, icon: <Code2 size={12} /> },
      ]}
      expanded={expanded}
      onToggleExpand={() => setExpanded((v) => !v)}
      labels={labels}
      actions={
        <>
          <button
            type="button"
            className="dima-code-btn is-run"
            onClick={run}
            disabled={running || streaming}
            aria-label={labels.run}
          >
            {running ? <RotateCcw size={13} className="dima-settings-spin" /> : <Play size={13} />}
            <span>{running ? labels.running : labels.run}</span>
          </button>
          <button type="button" className="dima-code-btn" onClick={() => onCopy(code)} aria-label={labels.copy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? labels.copied : labels.copy}</span>
          </button>
          <button type="button" className="dima-code-btn" onClick={() => downloadSnippet(code, ext)} aria-label={labels.download}>
            <Download size={13} />
            <span>{labels.download}</span>
          </button>
        </>
      }
    >
      {tab === "code" ? (
        <CodePane lang={lang} code={code} />
      ) : (
        <div className={`dima-artifact-console${result?.ok === false ? " is-error" : ""}`}>
          {running || streaming ? (
            <p className="dima-artifact-status">{streaming ? labels.pythonWait : labels.running}</p>
          ) : empty ? (
            <p className="dima-artifact-status">{labels.pythonIdle}</p>
          ) : (
            <>
              {out ? <pre className="is-out">{out}</pre> : null}
              {err ? <pre className="is-err">{err}</pre> : null}
              {!out && !err ? (
                <p className="dima-artifact-status">
                  {result?.ok ? labels.pythonEmpty : labels.pythonFailed}
                </p>
              ) : null}
            </>
          )}
        </div>
      )}
    </ArtifactChrome>
  );
}

export function renderDimaArtifact(block, labels, streaming) {
  // While the fence is still open or the reply is still streaming, keep a
  // stable highlighted code block. Promoting to a live HTML/Python widget
  // mid-stream flashes raw source, then swaps the whole bubble at once.
  if (streaming || block?.unclosed) return null;
  if (isHtmlArtifact(block.lang, block.code)) {
    return <DimaHtmlArtifact lang={block.lang} code={block.code} labels={labels} />;
  }
  if (isPythonArtifact(block.lang)) {
    return (
      <DimaPythonArtifact
        lang={block.lang}
        code={block.code}
        labels={labels}
        streaming={streaming}
      />
    );
  }
  return null;
}
