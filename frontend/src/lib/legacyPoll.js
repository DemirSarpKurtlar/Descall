/**
 * Old text polls (`media_type='poll'` or a DM `**Poll: …**` text), parsed for a
 * read-only card. Markdown (bold markers, `\*` escapes) goes through the shared
 * chat parser (lib/messageMarkdown.js) so it matches what bubbles render.
 */
import { plainText } from "./messageMarkdown.js";

export function isLegacyPollText(text) {
  return /^\*\*Poll: /.test(String(text || ""));
}

export function parseLegacyPoll(text) {
  const lines = String(text || "").split("\n");
  const question = plainText(lines[0] || "").replace(/^(?:Poll|Anket):\s*/, "").trim();
  const options = lines
    .slice(1)
    .map((l) => l.match(/^\s*\d+\.\s+(.*)$/))
    .filter(Boolean)
    .map((x) => plainText(x[1]).trim());
  return { question, options };
}
