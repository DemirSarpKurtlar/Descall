/**
 * Davet ödülleri board: pure view helpers (tested by invitesAdmin.selftest.mjs).
 */

export function bandTone(band) {
  return band === "high" ? "dg" : band === "medium" ? "wa" : "ok";
}

/** "+%18" (tr) / "+18%" (others) for the opens KPI; "–" when there is no earlier period. */
export function deltaText(delta, locale = "tr") {
  if (delta == null || !Number.isFinite(Number(delta))) return "–";
  const n = Math.round(Number(delta));
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return String(locale).startsWith("tr") ? `${sign}%${Math.abs(n)}` : `${sign}${Math.abs(n)}%`;
}

/** Funnel rows of the draft: opened, signed up, first message, came back, paid. */
export function funnelRows(f) {
  if (!f) return [];
  return [
    { key: "opened", label: "fOpened", value: f.opened, tone: "b1", rate: 100, rateKey: null, rateTone: "mu" },
    { key: "signups", label: "fSignups", value: f.signups, tone: "b2", rate: f.rates?.signup, rateKey: "kSignupsSub", rateTone: "mu" },
    { key: "first", label: "fFirst", value: f.firstMessage, tone: "b3", rate: f.rates?.firstMessage, rateKey: "fRateFirst", rateTone: "brt" },
    { key: "returned", label: "fReturned", value: f.returned, tone: "b4", rate: f.rates?.returned, rateKey: "fRateActive", rateTone: "okt" },
    { key: "paid", label: "fPaid", value: f.paid, tone: "b5", rate: null, rateKey: f.held ? "fHeld" : null, extra: f.held, rateTone: "wat" },
  ];
}

const SIGNAL_ICON = { same_device: "device", same_subnet: "globe", disposable_email: "mail", fast_first_message: "bolt", inviter_only: "msg" };
const ACTION_TONE = { hold: "wa", deny: "dg", warn: "", none: "" };

/** Abuse shield rows in the draft's order with icon and tones. */
export function signalRows(shield) {
  const order = ["same_device", "same_subnet", "disposable_email", "fast_first_message", "inviter_only"];
  const by = new Map((shield || []).map((s) => [s.code, s]));
  return order
    .filter((c) => by.has(c))
    .map((c) => {
      const s = by.get(c);
      const tone = s.action === "deny" || s.action === "hold" ? (s.action === "deny" || c === "same_device" ? "dg" : "wa") : s.action === "warn" ? "wa" : "mu";
      return { code: c, count: s.count, action: s.action, icon: SIGNAL_ICON[c], tone, actionTone: ACTION_TONE[s.action] || "" };
    });
}

/** One action-log line (the bold actor is drawn by the caller). */
export function logText(l, t, locale = "tr") {
  const user = l.inviter || "?";
  switch (l.kind) {
    case "paid":
      return t("dvt.adm.l_paidLine", { a: l.inviter || "?", b: l.invitee || "?", amount: l.amount });
    case "rules": {
      const changes = (l.diff || [])
        .map((d) => `${t(`dvt.adm.rk_${d.key}`) === `dvt.adm.rk_${d.key}` ? t("dvt.adm.rk_other") : t(`dvt.adm.rk_${d.key}`)} ${fmt(d.from)} → ${fmt(d.to)}`)
        .join(", ");
      return changes ? t("dvt.adm.l_rules", { changes }) : t("dvt.adm.l_rulesV", { v: l.version || "?" });
    }
    case "auto_hold":
    case "hold":
    case "release":
    case "revoke":
    case "pause":
    case "resume":
    case "alert_ignore":
      return t(`dvt.adm.l_${l.kind}`, { user, n: l.count, amount: l.amount });
    default:
      return l.kind;
  }
}

function fmt(v) {
  if (v == null) return "–";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
