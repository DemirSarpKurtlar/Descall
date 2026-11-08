/** Shared test fixtures. */
import { loadPolicy } from "../lib/config.mjs";

export const policy = loadPolicy();

/** A valid script whose claims point at real repo files. */
export function makeScript(over = {}) {
  return {
    id: "test-script",
    theme: "ses-kalitesi",
    title: "Test",
    hook: { lines: ["Klavye sesin", "*gitmesin*"] },
    scenes: [
      { lines: ["Gürültü engelleme", "*varsayılan açık*"], visual: { type: "toggles", items: ["Gürültü engelleme"] } },
      { lines: ["Yankı engelleme", "*de açık*"] },
      { lines: ["İstersen", "*Güçlü* modu seç"], visual: { type: "chips", items: ["Kapalı", "Açık", "Güçlü"] } },
    ],
    caption: "Gürültü engelleme varsayılan olarak açık.",
    hashtags: ["#descall", "#seslisohbet", "#mikrofon"],
    sources: [{ claim: "Varsayılan açık", file: "frontend/src/lib/voiceProfile.js", match: 'noiseMode: "on"' }],
    ...over,
  };
}

/** Minimal fetch Response stand-in. */
export function res(status, body, headers = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

/** Scripted fetch: each call shifts the next handler; records calls. */
export function scriptedFetch(handlers) {
  const calls = [];
  const queue = [...handlers];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const h = queue.shift();
    if (!h) throw new Error(`unexpected fetch ${init.method || "GET"} ${url}`);
    return typeof h === "function" ? h(String(url), init) : h;
  };
  f.calls = calls;
  f.pending = () => queue.length;
  return f;
}
