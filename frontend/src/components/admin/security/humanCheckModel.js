/**
 * Güvenlik Merkezi "İnsan doğrulaması" card (Cloudflare Turnstile): pure helpers over the
 * overview's `humanCheck` block (backend lib/turnstile.js adminStatus). Selftested in
 * security.selftest.mjs.
 */

export const HUMAN_MODES = Object.freeze(["enforce", "monitor", "off"]);
export const HUMAN_ACTIONS = Object.freeze(["register", "social_signup", "password_reset", "login"]);

/** The pill in the card header: { key, tone }. */
export function humanStatus(hc) {
  if (!hc) return { key: "unknown", tone: "gray" };
  if (!hc.configured) return { key: hc.tableMissing ? "tableMissing" : "notSetUp", tone: "amber" };
  if (hc.misconfigured) return { key: "badSecret", tone: "red" };
  if (hc.mode === "off") return { key: "off", tone: "red" };
  if (hc.mode === "monitor") return { key: "monitor", tone: "amber" };
  return { key: "enforcing", tone: "green" };
}

/** Four tiles: passed, refused (fail + blocked), let through without a token, Cloudflare down. */
export function humanKpis(hc) {
  const t = hc?.stats?.totals || {};
  const n = (k) => Number(t[k]) || 0;
  return {
    pass: n("pass"),
    refused: n("fail") + n("blocked"),
    fallback: n("fallback") + n("monitor"),
    failOpen: n("failOpen"),
    challenged: n("challenged"),
    checks: Number(hc?.stats?.checks) || 0,
    passRate: hc?.stats?.passRate == null ? null : Number(hc.stats.passRate),
  };
}

/** Stacked hourly bars (24): heights in 0..1 of the busiest hour, per segment. */
export function humanBars(series) {
  const pass = series?.pass || [];
  const refused = series?.refused || [];
  const let_ = series?.let || [];
  const len = Math.max(pass.length, refused.length, let_.length, 0);
  let max = 0;
  for (let i = 0; i < len; i += 1) max = Math.max(max, (pass[i] || 0) + (refused[i] || 0) + (let_[i] || 0));
  const out = [];
  for (let i = 0; i < len; i += 1) {
    const p = pass[i] || 0;
    const r = refused[i] || 0;
    const l = let_[i] || 0;
    out.push({ i, pass: p, refused: r, let: l, total: p + r + l, h: max ? { pass: p / max, refused: r / max, let: l / max } : { pass: 0, refused: 0, let: 0 } });
  }
  return { bars: out, max };
}

/** Rows of the per-action list, in the fixed order. */
export function humanActionRows(hc) {
  const by = hc?.stats?.byAction || {};
  return HUMAN_ACTIONS.map((a) => {
    const r = by[a] || {};
    const v = (k) => Number(r[k]) || 0;
    return {
      action: a,
      pass: v("pass"),
      refused: v("fail") + v("blocked"),
      let: v("fallback") + v("monitor") + v("failOpen"),
      challenged: v("challenged"),
    };
  });
}

/** Whether switching to `mode` needs a reason (anything but enforce). */
export function humanModeNeedsReason(mode) {
  return mode === "monitor" || mode === "off";
}

/** Health lines under the switch: [{ key, tone, vars }]. */
export function humanNotes(hc) {
  if (!hc) return [];
  const out = [];
  if (!hc.configured) out.push({ key: hc.tableMissing ? "noteTable" : "noteSetup", tone: "amber" });
  if (hc.misconfigured) out.push({ key: "noteBadSecret", tone: "red" });
  if (hc.unreachable) out.push({ key: "noteUnreachable", tone: "amber" });
  if (hc.envOverride) out.push({ key: "noteEnv", tone: "amber", vars: { mode: hc.envOverride } });
  if (hc.testKeys) out.push({ key: "noteTestKeys", tone: "amber" });
  const fb = hc.fallback;
  if (fb && fb.fallbackGlobal > 0 && fb.usedThisHour >= fb.fallbackGlobal) out.push({ key: "noteBudgetFull", tone: "red", vars: { n: fb.fallbackGlobal } });
  return out;
}
