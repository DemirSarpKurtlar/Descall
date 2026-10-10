/**
 * Brace-aware scan for icon-only <button> / <motion.button> elements
 * that have no accessible name (no aria-label, aria-labelledby, or visible text).
 * Child components whose name ends in Content render the row label themselves.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SYMBOL_ONLY = /^[\s×✕✖✗xX+\-–—•·…<>‹›✓✔✎⚙⋮⋯]+$/;

export function walkJsxFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "node_modules" || name === "dist") continue;
        walk(p);
      } else if (/\.(jsx|js)$/.test(name)) out.push(p);
    }
  };
  walk(root);
  return out;
}

function skipString(src, i, quote) {
  i++;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (quote === "`" && c === "$" && src[i + 1] === "{") {
      i = skipBraces(src, i + 1);
      continue;
    }
    if (c === quote) return i + 1;
    i++;
  }
  return i;
}

function skipBraces(src, i) {
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(src, i, c);
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? src.length : nl + 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      i++;
      if (depth === 0) return i;
      continue;
    }
    i++;
  }
  return i;
}

/** Replace comments with spaces so indexes still match the original source. */
export function maskComments(src) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === "\\") {
        out += src.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (quote === "`" && c === "$" && src[i + 1] === "{") {
        const end = skipBraces(src, i + 1);
        out += src.slice(i, end);
        i = end;
        continue;
      }
      if (c === quote) quote = null;
      out += c;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      const end = nl < 0 ? src.length : nl;
      out += " ".repeat(end - i);
      i = end;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      const chunk = src.slice(i, stop).replace(/[^\n]/g, " ");
      out += chunk;
      i = stop;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function parseOpenTag(src, i) {
  const start = i;
  if (src[i] !== "<" || src[i + 1] === "/" || src[i + 1] === "!") return null;
  let j = i + 1;
  let name = "";
  while (j < src.length && /[\w.]/.test(src[j])) {
    name += src[j++];
    if (name.length > 40) return null;
  }
  if (name !== "button" && name !== "motion.button") return null;
  let brace = 0;
  let quote = null;
  while (j < src.length) {
    const c = src[j];
    if (quote) {
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (quote === "`" && c === "$" && src[j + 1] === "{") {
        j = skipBraces(src, j + 1);
        continue;
      }
      if (c === quote) quote = null;
      j++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      j++;
      continue;
    }
    if (c === "{") {
      brace++;
      j++;
      continue;
    }
    if (c === "}") {
      brace = Math.max(0, brace - 1);
      j++;
      continue;
    }
    if (c === ">" && brace === 0) {
      const selfClosing = src[j - 1] === "/";
      return { start, end: j + 1, name, selfClosing, open: src.slice(start, j + 1) };
    }
    j++;
  }
  return null;
}

function attrValue(open, attr) {
  const re = new RegExp(`(?:^|[\\s\\n])${attr}\\s*=\\s*`);
  const m = re.exec(open);
  if (!m) return null;
  let i = m.index + m[0].length;
  const c = open[i];
  if (c === '"' || c === "'") {
    let k = i + 1;
    while (k < open.length) {
      if (open[k] === "\\") {
        k += 2;
        continue;
      }
      if (open[k] === c) break;
      k++;
    }
    return { expr: open.slice(i, k + 1), end: k + 1 };
  }
  if (c === "{") {
    const end = skipBraces(open, i);
    return { expr: open.slice(i, end), end };
  }
  return null;
}

function hasAttr(open, attr) {
  return new RegExp(`(?:^|[\\s\\n{])${attr}\\s*=`).test(open);
}

function elementEnd(src, open) {
  if (open.selfClosing) return open.end;
  const closeName = open.name;
  let i = open.end;
  let depth = 1;
  while (i < src.length) {
    if (src[i] === "{") {
      i = skipBraces(src, i);
      continue;
    }
    if (src[i] === "<" && src[i + 1] === "/") {
      const rest = src.slice(i + 2, i + 2 + closeName.length + 1);
      if (rest.startsWith(closeName) && /[\s>]/.test(rest[closeName.length] || ">")) {
        depth--;
        const gt = src.indexOf(">", i);
        i = gt < 0 ? src.length : gt + 1;
        if (depth === 0) return i;
        continue;
      }
    }
    if (src[i] === "<" && /[A-Za-z]/.test(src[i + 1] || "")) {
      const nested = parseOpenTag(src, i);
      if (nested && (nested.name === "button" || nested.name === "motion.button")) {
        depth++;
        i = nested.end;
        continue;
      }
    }
    i++;
  }
  return src.length;
}

function indexOfTagEnd(src, i) {
  let j = i + 1;
  let brace = 0;
  let quote = null;
  while (j < src.length) {
    const c = src[j];
    if (quote) {
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (quote === "`" && c === "$" && src[j + 1] === "{") {
        j = skipBraces(src, j + 1);
        continue;
      }
      if (c === quote) quote = null;
      j++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      j++;
      continue;
    }
    if (c === "{") {
      brace++;
      j++;
      continue;
    }
    if (c === "}") {
      brace = Math.max(0, brace - 1);
      j++;
      continue;
    }
    if (c === ">" && brace === 0) return j + 1;
    j++;
  }
  return src.length;
}

function textNodeIsName(text) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed || SYMBOL_ONLY.test(collapsed)) return false;
  if (/&&|\|\||===|!==|=>|\?/.test(collapsed)) return false;
  if (/^[\w.]*icon$/i.test(collapsed)) return false;
  if (/^[\w.]+\([^)]*\)$/.test(collapsed)) return /label|name|title|text|username|cta|display/i.test(collapsed);
  return /[A-Za-zÀ-ÿ0-9]/.test(collapsed);
}

function expressionHasName(expr) {
  if (/\bt\s*\(/.test(expr) || /\bchildren\b/.test(expr)) return true;
  if (hasVisibleName(expr)) return true;
  const strings = [...expr.matchAll(/["'`]([^"'`]*)["'`]/g)].map((m) => m[1]);
  if (strings.some((s) => /[A-Za-zÀ-ÿ]{2,}/.test(s) && !/^[a-z0-9_:/.[\]#-]+$/.test(s))) return true;
  if (/\b(labelOf|alertCopy|resolveDisplayName|personName|displayName)\s*\(/.test(expr)) return true;
  return false;
}

function hasVisibleName(inner) {
  if (/<[A-Z][\w.]*Content\b/.test(inner)) return true;
  let i = 0;
  let text = "";
  const flush = () => {
    const hit = textNodeIsName(text);
    text = "";
    return hit;
  };
  while (i < inner.length) {
    if (inner[i] === "<") {
      if (flush()) return true;
      if (inner.startsWith("</", i)) {
        const gt = inner.indexOf(">", i);
        i = gt < 0 ? inner.length : gt + 1;
        continue;
      }
      i = indexOfTagEnd(inner, i);
      continue;
    }
    if (inner[i] === "{") {
      if (flush()) return true;
      const end = skipBraces(inner, i);
      const expr = inner.slice(i + 1, end - 1);
      if (expressionHasName(expr)) return true;
      i = end;
      continue;
    }
    const next = (() => {
      let k = i;
      while (k < inner.length && inner[k] !== "<" && inner[k] !== "{") k++;
      return k;
    })();
    text += inner.slice(i, next);
    i = next;
  }
  return flush();
}

function braceDepthAt(src, index) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < index && i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (quote === "`" && c === "$" && src[i + 1] === "{") {
        i = skipBraces(src, i + 1) - 1;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? src.length : nl;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
  }
  return depth;
}

export function tInScope(src, index) {
  const token = "const t = useT()";
  const decl = src.lastIndexOf(token, index);
  if (decl < 0) return false;
  const floor = braceDepthAt(src, decl);
  let depth = floor;
  let quote = null;
  for (let i = decl; i < index && i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (quote === "`" && c === "$" && src[i + 1] === "{") {
        i = skipBraces(src, i + 1) - 1;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? src.length : nl;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth < floor) return false;
    }
  }
  return true;
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

/**
 * @returns {{ titled: object[], unlabeled: object[] }}
 * titled: icon buttons that already have title= (copy onto aria-label)
 * unlabeled: icon buttons with neither title nor a visible name
 */
export function scanSource(original) {
  const src = maskComments(original);
  const titled = [];
  const unlabeled = [];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) break;
    if (src.startsWith("</", lt) || src.startsWith("<!", lt)) {
      i = lt + 1;
      continue;
    }
    const open = parseOpenTag(src, lt);
    if (!open) {
      i = lt + 1;
      continue;
    }
    const end = elementEnd(src, open);
    const closeLen = open.selfClosing ? 0 : open.name.length + 3;
    const body = open.selfClosing ? "" : src.slice(open.end, Math.max(open.end, end - closeLen));
    const named = hasAttr(open.open, "aria-label") || hasAttr(open.open, "aria-labelledby");
    const visible = hasVisibleName(body);
    if (!named && !visible) {
      const title = attrValue(open.open, "title");
      const line = lineOf(src, open.start);
      if (title) {
        titled.push({
          start: open.start,
          end: open.end,
          insertAt: open.start + title.end,
          titleExpr: title.expr,
          line,
        });
      } else {
        unlabeled.push({
          start: open.start,
          end: open.end,
          line,
          open: open.open,
          body,
          selfClosing: open.selfClosing,
        });
      }
    }
    i = Math.max(open.end, lt + 1);
  }
  return { titled, unlabeled };
}
