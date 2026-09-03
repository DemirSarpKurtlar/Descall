import { useMemo, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { extensionForLang, highlight, inline, parseDimaMarkdown } from "./dimaMarkdown";
import { renderDimaArtifact } from "./DimaLiveArtifact";

function artifactLabels({ copyLabel, downloadLabel, copiedLabel, labels }) {
  return {
    copy: labels?.copyCode || labels?.copy || copyLabel,
    download: labels?.downloadCode || labels?.download || downloadLabel,
    copied: labels?.copied || copiedLabel,
    preview: labels?.preview || "Preview",
    code: labels?.code || "Code",
    output: labels?.output || "Output",
    run: labels?.run || "Run",
    running: labels?.running || "Running…",
    expand: labels?.expand || "Expand",
    shrink: labels?.shrink || "Close",
    htmlLive: labels?.htmlLive || "Live preview",
    htmlLiveHint: labels?.htmlLiveHint || "Runs in a sandbox inside Descall",
    pythonLive: labels?.pythonLive || "Python",
    pythonLiveHint: labels?.pythonLiveHint || "Run this script in Descall",
    pythonWait: labels?.pythonWait || "Waiting for the script to finish writing…",
    pythonIdle: labels?.pythonIdle || "Press Run to execute",
    pythonEmpty: labels?.pythonEmpty || "Finished with no output.",
    pythonFailed: labels?.pythonFailed || "Could not run this script.",
  };
}

function CodeBlock({ lang, code, copyLabel, downloadLabel, copiedLabel, labels, streaming, unclosed }) {
  const artifact = renderDimaArtifact(
    { lang, code, unclosed: Boolean(unclosed) },
    artifactLabels({ copyLabel, downloadLabel, copiedLabel, labels }),
    streaming,
  );
  if (artifact) return artifact;
  return (
    <PlainCodeBlock
      lang={lang}
      code={code}
      copyLabel={copyLabel}
      downloadLabel={downloadLabel}
      copiedLabel={copiedLabel}
    />
  );
}

function PlainCodeBlock({ lang, code, copyLabel, downloadLabel, copiedLabel }) {
  const [copied, setCopied] = useState(false);
  const html = useMemo(() => highlight(code, lang), [code, lang]);
  const label = (lang || "text").toUpperCase();
  const ext = extensionForLang(lang);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  const onDownload = () => {
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
  };

  return (
    <div className="dima-code-wrap">
      <div className="dima-code-toolbar">
        <span className="dima-code-lang">{label}</span>
        <div className="dima-code-actions">
          <button type="button" className="dima-code-btn" onClick={onCopy} aria-label={copyLabel}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? copiedLabel : copyLabel}</span>
          </button>
          <button type="button" className="dima-code-btn" onClick={onDownload} aria-label={downloadLabel}>
            <Download size={13} />
            <span>{downloadLabel}</span>
          </button>
        </div>
      </div>
      <pre className="dima-code" data-lang={lang || "text"}>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

function MarkdownTable({ header = [], rows = [] }) {
  const colCount = Math.max(
    header.length,
    ...rows.map((r) => (Array.isArray(r) ? r.length : 0)),
    0,
  );
  const heads = Array.from({ length: colCount }, (_, i) => header[i] ?? "");
  return (
    <div className="dima-table-wrap">
      <table className="dima-table">
        <thead>
          <tr>
            {heads.map((cell, i) => (
              <th key={`h-${i}`} dangerouslySetInnerHTML={{ __html: inline(cell) }} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={`r-${ri}`}>
              {heads.map((_, ci) => (
                <td
                  key={`c-${ri}-${ci}`}
                  dangerouslySetInnerHTML={{ __html: inline((row && row[ci]) || "") }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DimaMarkdownView({
  markdown,
  copyLabel = "Copy code",
  downloadLabel = "Download",
  copiedLabel = "Copied",
  streaming = false,
  labels = null,
}) {
  const blocks = useMemo(() => parseDimaMarkdown(markdown), [markdown]);

  return (
    <div className="dima-msg-body dima-md">
      {blocks.map((b, idx) => {
        if (b.type === "code") {
          return (
            <CodeBlock
              key={`c-${idx}`}
              lang={b.lang}
              code={b.code}
              copyLabel={copyLabel}
              downloadLabel={downloadLabel}
              copiedLabel={copiedLabel}
              labels={labels}
              streaming={streaming}
              unclosed={Boolean(b.unclosed)}
            />
          );
        }
        if (b.type === "table") {
          return <MarkdownTable key={`t-${idx}`} header={b.header} rows={b.rows} />;
        }
        if (b.type === "list") {
          return (
            <ul key={`l-${idx}`}>
              {b.items.map((item, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: inline(item) }} />
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={`o-${idx}`}>
              {b.items.map((item, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: inline(item) }} />
              ))}
            </ol>
          );
        }
        if (b.type === "blank") return <div key={`b-${idx}`} className="dima-md-gap" />;
        if (b.type === "h1") return <h1 key={`h1-${idx}`} dangerouslySetInnerHTML={{ __html: inline(b.text) }} />;
        if (b.type === "h2") return <h2 key={`h2-${idx}`} dangerouslySetInnerHTML={{ __html: inline(b.text) }} />;
        if (b.type === "h3") return <h3 key={`h3-${idx}`} dangerouslySetInnerHTML={{ __html: inline(b.text) }} />;
        if (b.type === "p") return <p key={`p-${idx}`} dangerouslySetInnerHTML={{ __html: inline(b.text) }} />;
        return null;
      })}
    </div>
  );
}
