function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapSyn(cls, text) {
  return `<span class="${cls}">${text}</span>`;
}

function highlight(code, lang) {
  const src = escapeHtml(code);
  const id = String(lang || "").toLowerCase();
  if (!id) return src;
  if (id === "json" || id === "jsonc") {
    return src
      .replace(/(&quot;[^&]*&quot;)/g, (m) => wrapSyn("dima-syn-str", m))
      .replace(/\b(\d+(?:\.\d+)?)\b/g, (m) => wrapSyn("dima-syn-num", m));
  }
  // Park comments/strings first so keyword highlighting cannot match `class=`
  // inside the spans we inject (that leaked as visible text in JSON fences).
  const parked = [];
  const park = (cls, text) => {
    parked.push(wrapSyn(cls, text));
    return `\u0000${parked.length - 1}\u0000`;
  };
  let out = src.replace(/(\/\/[^\n]*|#(?!!).*$)/gm, (m) => park("dima-syn-comment", m));
  out = out.replace(/(&quot;[^&]*&quot;|'[^']*'|`[^`]*`)/g, (m) => park("dima-syn-str", m));
  out = out.replace(
    /\b(const|let|var|function|return|if|else|for|while|class|import|from|export|async|await|def|True|False|None|and|or|not)\b/g,
    (m) => wrapSyn("dima-syn-kw", m),
  );
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => parked[Number(i)] || "");
  return out.replace(/\b(\d+(?:\.\d+)?)\b/g, (m) => wrapSyn("dima-syn-num", m));
}

function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code class="dima-inline-code">$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return s;
}

/** Map fence language → download file extension. */
export function extensionForLang(lang) {
  const id = String(lang || "txt").toLowerCase().replace(/[^a-z0-9+#.-]/g, "");
  const map = {
    javascript: "js",
    typescript: "ts",
    jsx: "jsx",
    tsx: "tsx",
    python: "py",
    py: "py",
    ruby: "rb",
    go: "go",
    rust: "rs",
    java: "java",
    kotlin: "kt",
    swift: "swift",
    csharp: "cs",
    cs: "cs",
    cpp: "cpp",
    c: "c",
    php: "php",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    yaml: "yml",
    yml: "yml",
    toml: "toml",
    xml: "xml",
    sql: "sql",
    bash: "sh",
    shell: "sh",
    sh: "sh",
    zsh: "sh",
    powershell: "ps1",
    ps1: "ps1",
    markdown: "md",
    md: "md",
    text: "txt",
    txt: "txt",
    dockerfile: "Dockerfile",
    diff: "diff",
  };
  return map[id] || (id || "txt");
}

function splitTableRow(line) {
  const raw = String(line || "").trim();
  if (!raw.includes("|")) return null;
  let s = raw;
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  if (!cells || !cells.length) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function isTableRow(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed || !trimmed.includes("|")) return false;
  if (isTableSeparator(trimmed)) return false;
  const cells = splitTableRow(trimmed);
  return Boolean(cells && cells.length >= 2);
}

function isFenceLine(line) {
  return /^ {0,3}```/.test(String(line || ""));
}

function fenceLang(line) {
  return String(line || "").trim().slice(3).trim().toLowerCase();
}

/** Streaming prefix of an opening fence, e.g. "`", "``", "```htm". */
function isIncompleteFenceLine(line) {
  return /^`{1,3}[a-zA-Z0-9+-]*$/.test(String(line || "").trim());
}

/**
 * Parse markdown into a list of block descriptors for React rendering.
 * Unclosed ``` fences stay a single code block so streaming does not flash
 * source lines as paragraphs, then jump to a formatted bubble.
 * @returns {Array<{type:string, ...}>}
 */
export function parseDimaMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  let listBuf = [];
  let olBuf = [];
  const flushList = () => {
    if (!listBuf.length) return;
    blocks.push({ type: "list", items: [...listBuf] });
    listBuf = [];
  };
  const flushOl = () => {
    if (!olBuf.length) return;
    blocks.push({ type: "ol", items: [...olBuf] });
    olBuf = [];
  };
  const flushLists = () => {
    flushList();
    flushOl();
  };

  while (i < lines.length) {
    const line = lines[i];
    if (isFenceLine(line)) {
      flushLists();
      const lang = fenceLang(line);
      const body = [];
      i += 1;
      let closed = false;
      while (i < lines.length) {
        if (isFenceLine(lines[i])) {
          closed = true;
          break;
        }
        body.push(lines[i]);
        i += 1;
      }
      blocks.push({
        type: "code",
        lang: lang || "text",
        code: body.join("\n"),
        unclosed: !closed,
      });
      if (closed) i += 1;
      continue;
    }

    // GFM tables: header | sep | rows… — never leave raw pipes in paragraphs.
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushLists();
      const header = splitTableRow(line) || [];
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && isTableRow(lines[i]) && !isTableSeparator(lines[i])) {
        rows.push(splitTableRow(lines[i]) || []);
        i += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushOl();
      listBuf.push(line.replace(/^\s*[-*]\s+/, ""));
      i += 1;
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flushList();
      olBuf.push(line.replace(/^\s*\d+\.\s+/, ""));
      i += 1;
      continue;
    }
    flushLists();
    if (!line.trim()) {
      blocks.push({ type: "blank" });
    } else if (line.startsWith("### ")) {
      blocks.push({ type: "h3", text: line.slice(4) });
    } else if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3) });
    } else if (line.startsWith("# ")) {
      blocks.push({ type: "h1", text: line.slice(2) });
    } else {
      blocks.push({ type: "p", text: line });
    }
    i += 1;
  }
  flushLists();
  const last = blocks[blocks.length - 1];
  if (last?.type === "p" && isIncompleteFenceLine(last.text)) {
    const lang = String(last.text || "").replace(/`/g, "").trim().toLowerCase();
    blocks.pop();
    blocks.push({ type: "code", lang: lang || "text", code: "", unclosed: true });
  }
  return blocks;
}

/** Legacy HTML renderer (kept for tests / non-React callers). */
export function renderDimaMarkdown(markdown) {
  const blocks = parseDimaMarkdown(markdown);
  return blocks
    .map((b) => {
      if (b.type === "code") {
        return `<pre class="dima-code" data-lang="${escapeHtml(b.lang)}"><code>${highlight(b.code, b.lang)}</code></pre>`;
      }
      if (b.type === "list") {
        return `<ul>${b.items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`;
      }
      if (b.type === "ol") {
        return `<ol>${b.items.map((item) => `<li>${inline(item)}</li>`).join("")}</ol>`;
      }
      if (b.type === "table") {
        const head = `<thead><tr>${(b.header || [])
          .map((cell) => `<th>${inline(cell)}</th>`)
          .join("")}</tr></thead>`;
        const body = `<tbody>${(b.rows || [])
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody>`;
        return `<div class="dima-table-wrap"><table class="dima-table">${head}${body}</table></div>`;
      }
      if (b.type === "blank") return "";
      if (b.type === "h1") return `<h1>${inline(b.text)}</h1>`;
      if (b.type === "h2") return `<h2>${inline(b.text)}</h2>`;
      if (b.type === "h3") return `<h3>${inline(b.text)}</h3>`;
      if (b.type === "p") return `<p>${inline(b.text)}</p>`;
      return "";
    })
    .join("\n");
}

export { escapeHtml, highlight, inline };
