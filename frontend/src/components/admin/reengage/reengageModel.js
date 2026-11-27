/** Growth 3B console: pure helpers (reengageModel.selftest.mjs). */

export const LANG_ROWS = Object.freeze([
  { id: "tr", code: "TR", name: "Türkçe" },
  { id: "pt-BR", code: "PT", name: "Português" },
  { id: "en", code: "EN", name: "English" },
  { id: "de", code: "DE", name: "Deutsch" },
  { id: "es", code: "ES", name: "Español" },
  { id: "fr", code: "FR", name: "Français" },
  { id: "ru", code: "RU", name: "Русский" },
]);

export const PLACEHOLDERS = Object.freeze(["arkadas_1", "arkadas_2", "sunucu", "sayi", "bahsetme"]);

/** Text split into plain parts and {placeholder} tokens (unknown ones flagged). */
export function splitTokens(text = "") {
  const out = [];
  const re = /\{([a-z0-9_]+)\}/gi;
  let last = 0;
  let m;
  const s = String(text);
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), token: false });
    out.push({ text: m[1], token: true, known: PLACEHOLDERS.includes(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), token: false });
  return out;
}

/** Right column of a campaign row: "%23 döndü", "%44 açtı", "bugün", "—". */
export function rateLabel(c, t) {
  if (c.id === "weekly_digest") return c.openRate != null ? t("rg3.admin.rateOpened", { pct: c.openRate }) : "—";
  if (c.id === "streak_reminder") return t("rg3.admin.rateToday", { count: c.sentToday || 0 });
  if (c.status === "draft") return "—";
  return c.returnRate != null ? t("rg3.admin.rateReturned", { pct: c.returnRate }) : "—";
}

/** Second line of a campaign row. */
export function campaignSub(c, t) {
  return t(`rg3.campaigns.${c.id}.short`);
}

/** Open-rate colour: low ones stand out (RU %4). */
export function openRateTone(rate) {
  if (rate == null) return "muted";
  if (rate < 10) return "bad";
  if (rate >= 35) return "good";
  return "";
}

/** "Kimler bu dalgada değil" rows with bar widths. */
export function excludedRows(ex = {}) {
  const rows = ["noDevice", "weekly", "unsubscribed", "quiet"].map((id) => ({ id, value: Number(ex?.[id]) || 0 }));
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) => ({ ...r, pct: Math.round((r.value / max) * 100) }));
}

/** 24 bars; quiet hours (23-09) marked, the top three hours highlighted. */
export function hourBars(hours = [], quiet = { start: 23, end: 9 }) {
  const list = Array.from({ length: 24 }, (_, h) => Number(hours?.[h]) || 0);
  const max = Math.max(1, ...list);
  const top = [...list.map((v, h) => ({ v, h }))]
    .filter((x) => !(x.h >= quiet.start || x.h < quiet.end) && x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
    .map((x) => x.h);
  return list.map((value, hour) => ({ hour, value, pct: Math.round((value / max) * 100), quiet: hour >= quiet.start || hour < quiet.end, top: top.includes(hour) }));
}

/** Header line: "6 kampanya · bugün 412 gönderim, 61 dönüş (kontrol grubuna göre net +9 puan)". */
export function todayLine(ov, t) {
  const n = (ov?.campaigns || []).length;
  const base = t("rg3.admin.todayLine", { campaigns: n, sent: ov?.today?.sent || 0, returned: ov?.today?.returned || 0 });
  const net = ov?.today?.net;
  return net != null ? `${base} ${t("rg3.admin.todayNet", { net: `${net > 0 ? "+" : ""}${net}` })}` : base;
}

/** Live window funnel bars. */
export function liveBars(c = {}) {
  const max = Math.max(1, c.sent || 0);
  return [
    ["delivered", c.delivered || 0],
    ["opened", c.opened || 0],
    ["openedApp", c.openedApp || 0],
    ["acted", c.acted || 0],
  ].map(([id, v]) => ({ id, value: v, pct: Math.round((v / max) * 100) }));
}
