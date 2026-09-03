/**
 * Detect and prepare DimaAI live artifacts (HTML preview, Python run).
 */

export function normalizeLang(lang) {
  return String(lang || "").toLowerCase().replace(/[^a-z0-9+#.-]/g, "");
}

export function isHtmlArtifact(lang, code = "") {
  const id = normalizeLang(lang);
  if (id === "html" || id === "htm" || id === "svg") return true;
  if (id === "xml" && /<svg[\s>]/i.test(code)) return true;
  const src = String(code || "").trim();
  if (!src) return false;
  if (id && id !== "text" && id !== "txt") return false;
  return /^<!DOCTYPE\s+html/i.test(src) || /^<html[\s>]/i.test(src);
}

export function isPythonArtifact(lang) {
  const id = normalizeLang(lang);
  return id === "python" || id === "py";
}

export function wrapHtmlPreview(code, lang) {
  const src = String(code || "");
  const id = normalizeLang(lang);
  const csp =
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data: blob: https:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data: https:; connect-src 'none'\">";
  const baseCss = `html,body{margin:0;background:#0e1016;color:#e8eaf2;font-family:Inter,system-ui,sans-serif;}a{color:#8ea2ff}img,svg,canvas,video{max-width:100%;height:auto;}`;

  if (id === "svg" || /^\s*<svg[\s>]/i.test(src)) {
    const svg = /<svg/i.test(src) ? src : `<svg xmlns="http://www.w3.org/2000/svg">${src}</svg>`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${csp}<style>${baseCss}body{min-height:100%;display:grid;place-items:center;padding:16px;}</style></head><body>${svg}</body></html>`;
  }

  if (/<!DOCTYPE\s+html/i.test(src) || /<html[\s>]/i.test(src)) {
    if (/<head[\s>]/i.test(src)) {
      return src.replace(/<head([^>]*)>/i, `<head$1>${csp}`);
    }
    return src.replace(/<html([^>]*)>/i, `<html$1><head>${csp}</head>`);
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${csp}<style>${baseCss}body{padding:16px;}</style></head><body>${src}</body></html>`;
}
