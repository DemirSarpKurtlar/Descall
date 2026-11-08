/**
 * Script model: defaults, the text a viewer sees, and the timeline.
 *
 * A script (content/*.json):
 *   id, theme, title,
 *   hook:   { lines: [..1-2 lines..], duration? }
 *   scenes: [{ lines: [..], visual?: { type, items?, value?, label?, ref? }, duration? }] (3-6)
 *   cta?:   { lines?: [..], chips?: [..] }
 *   caption, hashtags: ["#..."], audio?: "pad" | "silence",
 *   sources: [{ claim, file, match }]
 * Lines may wrap one accent span in *stars*.
 */
import { TIMING } from "./config.mjs";
import { wordCount, plainLine } from "./text.mjs";

export const VISUAL_TYPES = Object.freeze([
  "chips",
  "keys",
  "channels",
  "voice",
  "roles",
  "toggles",
  "checklist",
  "steps",
  "stat",
  "screenshot",
]);

const DEFAULT_CTA_LINES = ["descall.com'dan", "*ücretsiz* indir"];
const CHIPS_ALL = ["Windows", "iPhone", "Web"];
const CHIPS_DESKTOP_WEB = ["Windows", "Web"];

/** Themes whose claims are not about the App Store build (see policy restrictedPhrases). */
const NO_IPHONE_THEMES = new Set(["surum-notlari", "descall-plus"]);

/** Small label above the hook, per theme (a script may set its own `kicker`). */
export const THEME_KICKERS = Object.freeze({
  "discord-tasima": "Topluluk taşıma",
  "ses-kalitesi": "Ses kalitesi",
  "ekran-paylasimi": "Ekran paylaşımı",
  "sunucular-roller": "Sunucular",
  platformlar: "Her cihazda",
  ucretsiz: "Ücretsiz",
  "descall-plus": "Descall+",
  oyun: "Oyuncular için",
  "ders-grubu": "Çalışma grupları",
  ipuclari: "İpucu",
  "surum-notlari": "Yeni sürüm",
});

/** Fill defaults. Pure: returns a new object. */
export function resolveScript(script) {
  const s = structuredClone(script);
  s.cta = s.cta || {};
  if (!Array.isArray(s.cta.lines) || s.cta.lines.length === 0) s.cta.lines = [...DEFAULT_CTA_LINES];
  if (!Array.isArray(s.cta.chips)) s.cta.chips = NO_IPHONE_THEMES.has(s.theme) ? [...CHIPS_DESKTOP_WEB] : [...CHIPS_ALL];
  if (!s.audio) s.audio = "pad";
  if (typeof s.kicker !== "string" || !s.kicker.trim()) s.kicker = THEME_KICKERS[s.theme] || "Descall";
  if (!Array.isArray(s.hashtags)) s.hashtags = [];
  if (!Array.isArray(s.sources)) s.sources = [];
  return s;
}

/** Strings a visual puts on screen. */
export function visualTexts(visual) {
  if (!visual) return [];
  const out = [];
  if (Array.isArray(visual.items)) {
    for (const it of visual.items) {
      if (typeof it === "string") out.push(it);
      else if (it && typeof it === "object") {
        if (it.keys != null) out.push(String(it.keys).split("+").join(" + "));
        out.push(String(it.name ?? it.label ?? ""));
      }
    }
  }
  if (visual.value != null) out.push(String(visual.value));
  if (visual.label != null) out.push(String(visual.label));
  if (visual.caption != null) out.push(String(visual.caption));
  return out.filter((t) => t !== "");
}

/** Every string that appears on screen, with a path for error messages. */
export function onScreenTexts(script) {
  const s = resolveScript(script);
  const out = [{ path: "kicker", text: s.kicker, kind: "item" }];
  (s.hook?.lines || []).forEach((l, i) => out.push({ path: `hook.lines[${i}]`, text: plainLine(l), kind: "line" }));
  (s.scenes || []).forEach((sc, si) => {
    (sc.lines || []).forEach((l, i) => out.push({ path: `scenes[${si}].lines[${i}]`, text: plainLine(l), kind: "line" }));
    visualTexts(sc.visual).forEach((t, i) => out.push({ path: `scenes[${si}].visual[${i}]`, text: plainLine(t), kind: "item" }));
  });
  s.cta.lines.forEach((l, i) => out.push({ path: `cta.lines[${i}]`, text: plainLine(l), kind: "line" }));
  s.cta.chips.forEach((c, i) => out.push({ path: `cta.chips[${i}]`, text: c, kind: "item" }));
  return out;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Default length of a scene from its word and item count. */
export function sceneDuration(scene) {
  if (typeof scene.duration === "number") return scene.duration;
  const words = (scene.lines || []).reduce((n, l) => n + wordCount(plainLine(l)), 0);
  const items = visualTexts(scene.visual).length;
  const d = TIMING.sceneBase + words * TIMING.perWord + items * TIMING.perVisualItem;
  return round2(Math.min(TIMING.sceneMax, Math.max(TIMING.sceneMin, d)));
}

/**
 * Timeline in seconds: [{ kind: "hook"|"scene"|"cta", index, start, end }] and total.
 */
export function buildTimeline(script) {
  const s = resolveScript(script);
  const segments = [];
  let t = 0;
  const hookDur = typeof s.hook?.duration === "number" ? s.hook.duration : TIMING.hook;
  segments.push({ kind: "hook", index: 0, start: 0, end: round2(hookDur) });
  t = hookDur;
  (s.scenes || []).forEach((sc, i) => {
    const d = sceneDuration(sc);
    segments.push({ kind: "scene", index: i, start: round2(t), end: round2(t + d) });
    t += d;
  });
  const ctaDur = typeof s.cta.duration === "number" ? s.cta.duration : TIMING.cta;
  segments.push({ kind: "cta", index: 0, start: round2(t), end: round2(t + ctaDur) });
  t += ctaDur;
  return { segments, total: round2(t) };
}
