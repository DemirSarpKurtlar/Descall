/**
 * Final Instagram caption: body, a download line, then the hashtags on their own line.
 */
import { createHash } from "node:crypto";
import { normalizeForCompare } from "./text.mjs";

export const CAPTION_CTA_LINE = "Ücretsiz indir: descall.com";

export function buildCaption(script) {
  const body = String(script.caption ?? "").trim().replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  const parts = [body];
  if (!/descall\.com/i.test(body)) parts.push(CAPTION_CTA_LINE);
  const tags = [...new Set((script.hashtags || []).map((t) => String(t).trim()).filter(Boolean))];
  if (tags.length) parts.push(tags.join(" "));
  return parts.filter(Boolean).join("\n\n");
}

/** Stable hash of a caption for duplicate checks (case, punctuation and spacing ignored). */
export function captionHash(caption) {
  return createHash("sha256").update(normalizeForCompare(caption)).digest("hex").slice(0, 32);
}
