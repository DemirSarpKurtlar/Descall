/**
 * Geri bildirim penceresi, taslak A (3.7.14): the pure parts of the form and
 * the thread, shared by QuickFeedbackModal and its selftest.
 */

export const KINDS = [
  { id: "suggestion", icon: "Lightbulb", label: "fbk.kindSuggestion", hint: "fbk.kindSuggestionHint", q: "fbk.qSuggestion", ph: "fbk.phSuggestion" },
  { id: "bug", icon: "Bug", label: "fbk.kindBug", hint: "fbk.kindBugHint", q: "fbk.qBug", ph: "fbk.phBug" },
  { id: "praise", icon: "Heart", label: "fbk.kindPraise", hint: "fbk.kindPraiseHint", q: "fbk.qPraise", ph: "fbk.phPraise" },
];
export const AREAS = ["chat", "voice", "server", "shop", "settings", "other"];
export const AREA_LABEL = { chat: "fbk.areaChat", voice: "fbk.areaVoice", server: "fbk.areaServer", shop: "fbk.areaShop", settings: "fbk.areaSettings", other: "fbk.areaOther" };
export const FREQUENCIES = ["once", "sometimes", "always"];
export const FREQ_LABEL = { once: "fbk.freqOnce", sometimes: "fbk.freqSometimes", always: "fbk.freqAlways" };
export const LIKES = ["voice", "design", "screen", "servers", "shop", "speed"];
export const LIKE_LABEL = { voice: "fbk.likeVoice", design: "fbk.likeDesign", screen: "fbk.likeScreen", servers: "fbk.likeServers", shop: "fbk.likeShop", speed: "fbk.likeSpeed" };
export const STATUS_LABEL = { new: "fbk.statusNew", in_progress: "fbk.statusInProgress", resolved: "fbk.statusResolved", closed: "fbk.statusClosed" };
export const MAX_TEXT = 1000;
export const MIN_TEXT = 5;
export const MAX_SHOTS = 3;
export const MAX_SHOT_BYTES = 8 * 1024 * 1024;

export function emptyForm(kind = "suggestion") {
  return {
    kind: KINDS.some((k) => k.id === kind) ? kind : "suggestion",
    text: "",
    area: null,
    frequency: null,
    rating: 0,
    likes: [],
    shots: [], // { id, url, uploading, error, preview }
    includeDevice: true,
  };
}

export function canSubmit(form) {
  return String(form?.text || "").trim().length >= MIN_TEXT && !(form?.shots || []).some((s) => s.uploading);
}

/** The JSON body for POST /api/feedback/submit. */
export function buildSubmitBody(form, device = {}) {
  const body = {
    kind: form.kind,
    message: String(form.text || "").trim().slice(0, MAX_TEXT),
    includeDevice: Boolean(form.includeDevice),
    attachments: (form.shots || []).filter((s) => s.url && !s.error).map((s) => s.url).slice(0, MAX_SHOTS),
  };
  if (form.area && AREAS.includes(form.area)) body.area = form.area;
  if (form.kind === "bug" && FREQUENCIES.includes(form.frequency)) body.frequency = form.frequency;
  if (form.kind === "praise") {
    if (form.rating >= 1 && form.rating <= 5) body.rating = form.rating;
    const likes = (form.likes || []).filter((x) => LIKES.includes(x));
    if (likes.length) body.likes = likes;
  }
  if (body.includeDevice) {
    if (device.platform) body.platform = String(device.platform).slice(0, 60);
    if (device.version) body.appVersion = String(device.version).slice(0, 40);
  }
  return body;
}

/** "az önce" / "5 dk önce" / "3 sa önce" / "2 gün önce". `t` is the app translator. */
export function relTime(iso, t, now = Date.now()) {
  const at = new Date(iso || 0).getTime();
  if (!Number.isFinite(at) || at <= 0) return "";
  const min = Math.max(0, Math.floor((now - at) / 60000));
  if (min < 1) return t("fbk.justNow");
  if (min < 60) return t("fbk.minAgo", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("fbk.hourAgo", { n: h });
  return t("fbk.dayAgo", { n: Math.floor(h / 24) });
}

/** Total unread over the list. */
export function totalUnread(items) {
  return (Array.isArray(items) ? items : []).reduce((n, i) => n + (Number(i?.unread) || 0), 0);
}

/** Window event that opens the window, optionally on the "mine" tab / one thread. */
export const OPEN_EVENT = "descall:open-feedback";
export function feedbackOpenDetail(detail = {}) {
  const type = ["suggestion", "bug", "praise"].includes(detail?.type) ? detail.type : "suggestion";
  const tab = detail?.tab === "mine" || detail?.feedbackId ? "mine" : "new";
  return { type, tab, feedbackId: detail?.feedbackId ? String(detail.feedbackId) : null };
}
