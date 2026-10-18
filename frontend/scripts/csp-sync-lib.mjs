import { createHash } from "node:crypto";

/** sha256 CSP sources for every executable inline <script> in an HTML string. */
export function inlineScriptHashes(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (type && !/^(text\/javascript|module|application\/javascript)$/i.test(type)) continue; // data blocks (JSON-LD) never execute
    out.push(`sha256-${createHash("sha256").update(m[2], "utf8").digest("base64")}`);
  }
  return [...new Set(out)];
}
