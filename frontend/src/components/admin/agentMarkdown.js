/**
 * Admin agent answers: the small Markdown subset the model writes (paragraphs, "-" / "1."
 * lists, "|" tables, ### headings, **bold**, `code`). Parsed to plain data, rendered by
 * AdminAgent.jsx as React elements, so no HTML from the model ever reaches the page.
 * Tested by agentMarkdown.selftest.mjs.
 */

/** Inline text -> [{ t: "text" | "bold" | "code", v }] */
export function parseInline(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  const s = String(text || "");
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    const tok = m[0];
    out.push(tok.startsWith("**") ? { t: "bold", v: tok.slice(2, -2) } : { t: "code", v: tok.slice(1, -1) });
    last = m.index + tok.length;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** Text -> blocks: { type: "p" | "h" | "ul" | "ol" | "table" | "code", ... } */
export function parseBlocks(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    if (line.trim().startsWith("```")) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { body.push(lines[i]); i += 1; }
      i += 1;
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ type: "h", text: h[2] }); i += 1; continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i += 1; }
      const cells = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r.replace(/\|/g, "|").trim().replace(/^\|/, ""))).map(splitRow);
      if (cells.length) blocks.push({ type: "table", head: cells[0], rows: cells.slice(1) });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i += 1; }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i += 1; }
      blocks.push({ type: "ol", items });
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*([-*]\s+|\d+[.)]\s+|\||#{1,4}\s|```)/.test(lines[i])) { para.push(lines[i]); i += 1; }
    if (!para.length) { para.push(line); i += 1; }
    blocks.push({ type: "p", text: para.join("\n") });
  }
  return blocks;
}

/** One SSE chunk buffer -> [events, rest]. Lines starting with ":" are keep-alive pings. */
export function parseSse(buffer) {
  const events = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop();
  for (const part of parts) {
    const data = part.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
    if (!data) continue;
    try { events.push(JSON.parse(data)); } catch { /* ignore a broken frame */ }
  }
  return [events, rest];
}
