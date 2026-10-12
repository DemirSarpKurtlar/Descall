"use strict";

/**
 * List a UDP TURN URL ahead of a TLS one so ICE can prefer UDP and still
 * fall back to turns:. An existing turn: URL is left as-is.
 */
function expandTurnUrls(urls) {
  const list = Array.isArray(urls) ? urls : [urls];
  const out = [];
  for (const item of list) {
    const text = String(item || "").trim();
    if (!text) continue;
    if (/^turns:/i.test(text) && !/transport=udp/i.test(text)) {
      const udp = `${text.replace(/^turns:/i, "turn:")}${text.includes("?") ? "&" : "?"}transport=udp`;
      if (!out.includes(udp)) out.push(udp);
    }
    if (!out.includes(text)) out.push(text);
  }
  return out;
}

function liveKitEndpoints() {
  const primary = String(process.env.LIVEKIT_URL || "").trim();
  const extra = String(process.env.LIVEKIT_URLS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set([primary, ...extra].filter(Boolean))];
}

module.exports = { expandTurnUrls, liveKitEndpoints };
