/**
 * "Başla panosu" (growth phase 2A): pure client helpers, no React, no network.
 *
 *  - introSentence(): the ready first sentence for "Katıl ve gönder", built from the
 *    user's name, the server's category and the chosen interests, in the reader's language.
 *  - sparkPath(): SVG path for the small live charts (cards, KPI).
 *  - avatarTone(): a stable gradient class for a name (initial avatars).
 *  - undo countdown, quick replies, the "inactive" cache that keeps old accounts from
 *    asking the server again on every boot.
 * Tests: src/lib/onboarding.selftest.mjs.
 */

export const UNDO_SECONDS = 10;
export const WINDOW_DAYS = 5;
export const INTEREST_IDS = [
  "study",
  "gaming-minecraft",
  "music",
  "gaming-cs2",
  "gaming-lol",
  "anime",
  "tech",
  "art",
  "gaming-fps",
  "sports",
  "chat-friends",
  "gaming-other",
];
export const STEP_IDS = ["interests", "join", "first_message", "voice", "friend"];
export const MAX_INTERESTS = 8;

/** Toggle an interest; keeps catalog order and the cap. */
export function toggleInterest(list, id) {
  const set = new Set(Array.isArray(list) ? list : []);
  if (set.has(id)) set.delete(id);
  else if (INTEREST_IDS.includes(id)) set.add(id);
  return INTEREST_IDS.filter((x) => set.has(x)).slice(0, MAX_INTERESTS);
}

/**
 * The ready first sentence. `t` is the app translator; keys live in onb.intro.*.
 * The server's own category wins (that is what the room talks about), else the user's first
 * interest, else a plain "new here".
 */
export function introSentence(t, { name, category, interests = [] } = {}) {
  const first = String(name || "").trim() || t("onb.intro.someone");
  const parts = [t("onb.intro.hi", { name: first })];
  const cats = [];
  if (category && INTEREST_IDS.includes(category)) cats.push(category);
  for (const i of interests || []) if (!cats.includes(i) && INTEREST_IDS.includes(i)) cats.push(i);
  // One topic keeps it short and true: the room's own topic, else the first interest.
  parts.push(cats[0] ? t(`onb.intro.${cats[0]}`) : t("onb.intro.new"));
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Up to three quick replies for the Rehber card. */
export function quickReplies(t, { name, interests = [] } = {}) {
  const out = [t("onb.rehber.quickHi", { name: String(name || "").trim() || t("onb.intro.someone") })];
  for (const i of interests || []) {
    if (out.length >= 3) break;
    if (INTEREST_IDS.includes(i)) out.push(t(`onb.quick.${i}`));
  }
  if (out.length < 3) out.push(t("onb.quick.new"));
  if (out.length < 3) out.push(t("onb.quick.howto"));
  return out.slice(0, 3);
}

/** Path ("M x y L ...") through `values`, fit in w x h with 2px padding. */
export function sparkPath(values, w = 120, h = 24) {
  const v = (Array.isArray(values) ? values : []).map((x) => Math.max(0, Number(x) || 0));
  if (v.length < 2) return "";
  const max = Math.max(1, ...v);
  const step = (w - 4) / (v.length - 1);
  return v
    .map((n, i) => {
      const x = 2 + i * step;
      const y = h - 2 - (n / max) * (h - 4);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Same line closed down to the baseline (the soft fill under it). */
export function sparkArea(values, w = 120, h = 24) {
  const line = sparkPath(values, w, h);
  if (!line) return "";
  return `${line} L${(w - 2).toFixed(1)} ${h} L2 ${h} Z`;
}

const TONES = ["h1", "h2", "h3", "h4", "h5", "h6", "h7"];
const SERVER_TONES = ["g1", "g2", "g3", "g4", "g5", "g6", "g7"];
function hash(s) {
  let n = 0;
  for (const ch of String(s || "")) n = (n * 31 + ch.codePointAt(0)) >>> 0;
  return n;
}
export function avatarTone(key) {
  return TONES[hash(key) % TONES.length];
}
export function serverTone(key) {
  return SERVER_TONES[hash(key) % SERVER_TONES.length];
}

/** "Ders Kampı YKS 2027" -> "DK", "Lofi" -> "LO". */
export function serverInitials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const pick = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return pick.toLocaleUpperCase("tr");
}

export function initial(name) {
  return (String(name || "?").trim()[0] || "?").toLocaleUpperCase("tr");
}

/** Seconds left of the undo window (0 when over). */
export function undoLeft(startedAt, now = Date.now(), seconds = UNDO_SECONDS) {
  if (!startedAt) return 0;
  return Math.max(0, Math.ceil((startedAt + seconds * 1000 - now) / 1000));
}

/** Ring percent for "1/5". */
export function ringPercent(done, total) {
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.round((Math.min(t, Math.max(0, Number(done) || 0)) / t) * 100);
}

/** Old accounts: remember "not in the window" so the app stops asking on each boot. */
const INACTIVE_KEY = "descall:onb:inactive";
export function rememberInactive(storage, userId) {
  try {
    if (!userId) return;
    const list = new Set(JSON.parse(storage.getItem(INACTIVE_KEY) || "[]"));
    list.add(String(userId));
    storage.setItem(INACTIVE_KEY, JSON.stringify([...list].slice(-20)));
  } catch {
    /* private mode */
  }
}
export function isKnownInactive(storage, userId) {
  try {
    return new Set(JSON.parse(storage.getItem(INACTIVE_KEY) || "[]")).has(String(userId));
  } catch {
    return false;
  }
}

/** Crowd bars: [{v, peak}] -> heights in percent, at least 8 so an empty hour still shows. */
export function crowdBars(crowd) {
  const list = Array.isArray(crowd) && crowd.length ? crowd : new Array(12).fill({ v: 0, peak: false });
  return list.map((b) => ({ h: Math.max(8, Math.min(100, Number(b?.v) || 0)), peak: Boolean(b?.peak) }));
}

/** Short local time "14:06". */
export function hhmm(iso, locale) {
  const d = new Date(iso || "");
  if (!Number.isFinite(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale || "tr", { hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
}

/** Splits a translated sentence around a placeholder token so a part can be bold. */
export const RICH = "\u0001";
export function splitRich(text) {
  return String(text || "").split(RICH);
}

/** Which checklist subtitle to show for a step. */
export function stepSub(t, step, ctx = {}) {
  const id = step?.id;
  if (id === "interests") return ctx.interests?.length ? t("onb.step.interests.sDone", { n: ctx.interests.length }) : t("onb.step.interests.s");
  if (id === "join") {
    if (ctx.joinedName) return ctx.joinedName;
    if (ctx.previewName) return t("onb.step.join.sPreview", { name: ctx.previewName });
    return t("onb.step.join.s");
  }
  return t(`onb.step.${id}.s`);
}
