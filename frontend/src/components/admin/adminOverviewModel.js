/**
 * Genel Bakış (3.1, onaylı taslak): pure helpers behind the redesigned overview.
 * Only data /api/admin/overview already sends (+ product.feedbackInProgress /
 * feedbackFocus). Tested by adminOverviewModel.selftest.mjs.
 */

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Online bar segments in a fixed order; zero segments are dropped. */
export function presenceSegments(statusCounts) {
  const c = statusCounts || {};
  return [
    ["online", n(c.online)],
    ["idle", n(c.idle)],
    ["dnd", n(c.dnd)],
    ["invisible", n(c.invisible)],
  ].filter(([, v]) => v > 0);
}

/**
 * Today vs yesterday and the 7-day mean from the Istanbul-day sparkline
 * (oldest → newest, last entry = today).
 */
export function signupTrend(sparkline, today) {
  const rows = Array.isArray(sparkline) ? sparkline : [];
  const values = rows.map((r) => n(r?.signups));
  const todayCount = today != null ? n(today) : values.at(-1) ?? 0;
  if (values.length < 2) return { delta: null, avg: values.length ? values[0] : null };
  const yesterday = values[values.length - 2];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { delta: todayCount - yesterday, avg: Math.round(avg * 10) / 10 };
}

/** "+5" / "−2" / "±0" with a real minus sign. */
export function signedDelta(d) {
  if (d == null) return "";
  if (d > 0) return `+${d}`;
  if (d < 0) return `−${Math.abs(d)}`;
  return "±0";
}

const LEVEL_RANK = { bad: 0, warn: 1, ok: 2 };

/**
 * The to-do list: things that need an admin first (bad, warn), then the checks
 * that are fine. Each item names the section that resolves it.
 * @returns {{id: string, level: "bad"|"warn"|"ok", title: [string, object?], sub: [string, object?]|string, tab?: string}[]}
 */
export function buildTodo(data) {
  const product = data?.product || {};
  const safety = data?.safety || {};
  const system = data?.system || {};
  const alerts = data?.health?.alerts || [];
  const items = [];

  const active = n(product.feedbackInProgress);
  if (active > 0) {
    const f = product.feedbackFocus;
    items.push({
      id: "feedback-active",
      level: "warn",
      title: ["admin.ovTodoFeedbackActive", { n: active }],
      sub: f ? { focus: f } : ["admin.ovTodoFeedbackNewSub"],
      tab: "feedback",
    });
  }
  const fresh = n(product.newFeedback);
  if (fresh > 0) {
    items.push({ id: "feedback-new", level: "warn", title: ["admin.ovTodoFeedbackNew", { n: fresh }], sub: ["admin.ovTodoFeedbackNewSub"], tab: "feedback" });
  }

  const hot = Array.isArray(safety.hotTargets) ? safety.hotTargets.length : n(safety.hotTargets);
  const open = n(safety.openReports);
  if (hot > 0) {
    items.push({ id: "reports-hot", level: "bad", title: ["admin.ovTodoReportsHot"], sub: ["admin.ovTodoReports", { n: open }], tab: "reports" });
  } else if (open > 0) {
    items.push({ id: "reports", level: "warn", title: ["admin.ovTodoReports", { n: open }], sub: ["admin.ovTodoReportsSub", { n: n(safety.uniqueTargets) || open }], tab: "reports" });
  } else {
    items.push({ id: "reports", level: "ok", title: ["admin.ovTodoNoReports"], sub: ["admin.ovTodoNoReportsSub"] });
  }

  const flagged = n(system.flaggedMessages);
  items.push(
    flagged > 0
      ? { id: "flagged", level: "warn", title: ["admin.ovTodoFlagged", { n: flagged }], sub: ["admin.ovTodoFlaggedSub"], tab: "moderation" }
      : { id: "flagged", level: "ok", title: ["admin.ovTodoNoFlagged"], sub: ["admin.ovTodoNoFlaggedSub"] },
  );

  const errors = n(system.errorsLastHour);
  items.push(
    errors > 0
      ? { id: "errors", level: alerts.some((a) => a?.id === "errors") ? "bad" : "warn", title: ["admin.ovTodoErrors", { n: errors }], sub: ["admin.ovTodoErrorsSub"], tab: "system" }
      : { id: "errors", level: "ok", title: ["admin.ovTodoNoErrors"], sub: ["admin.ovTodoNoErrorsSub"] },
  );

  if (system.maintenance) {
    items.push({ id: "maintenance", level: "bad", title: ["admin.ovTodoMaintenance"], sub: ["admin.ovTodoMaintenanceSub"], tab: "maintenance" });
  }
  if (system.chatFrozen) {
    items.push({ id: "frozen", level: "warn", title: ["admin.ovTodoFrozen"], sub: ["admin.ovTodoFrozenSub"], tab: "maintenance" });
  }
  if (!system.maintenance && !system.chatFrozen) {
    items.push({ id: "maintenance", level: "ok", title: ["admin.ovTodoNoMaintenance"], sub: ["admin.ovTodoNoMaintenanceSub"] });
  }
  if (alerts.some((a) => a?.id === "memory")) {
    items.push({ id: "memory", level: "warn", title: ["admin.ovTodoMemory"], sub: ["admin.ovTodoMemorySub", { mb: n(system.rssMb) }], tab: "system" });
  }

  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => LEVEL_RANK[a.item.level] - LEVEL_RANK[b.item.level] || a.i - b.i)
    .map(({ item }) => item);
}

export function pendingCount(todo) {
  return todo.filter((x) => x.level !== "ok").length;
}

const ACTIONS_TR = {
  ban: "banladı", unban: "banını kaldırdı", kick: "sunucudan attı", timeout: "zaman aşımı verdi",
  untimeout: "zaman aşımını kaldırdı", mute: "susturdu", unmute: "susturmayı kaldırdı", warn: "uyardı",
  broadcast: "duyuru gönderdi", disconnect_all: "herkesin bağlantısını kesti", delete_message: "mesaj sildi",
  set_admin: "yönetici yaptı", remove_admin: "yöneticiliği kaldırdı", maintenance: "bakım ayarını değiştirdi",
};
const ACTIONS_EN = {
  ban: "banned", unban: "unbanned", kick: "kicked", timeout: "timed out", untimeout: "lifted a timeout on",
  mute: "muted", unmute: "unmuted", warn: "warned", broadcast: "sent an announcement",
  disconnect_all: "disconnected everyone", delete_message: "deleted a message", set_admin: "made admin",
  remove_admin: "removed admin from", maintenance: "changed maintenance",
};

/** Human verb for an audit action code; unknown codes are de-underscored, never shown raw. */
export function auditVerb(action, locale) {
  const code = String(action || "").trim();
  const tr = String(locale || "tr").toLowerCase().startsWith("tr");
  const map = tr ? ACTIONS_TR : ACTIONS_EN;
  if (map[code]) return map[code];
  const antibot = code.match(/^antibot_(.+)$/);
  if (antibot) return `${tr ? "bot denetimi" : "anti-bot"}: ${antibot[1].replace(/_/g, " ")}`;
  return code.replace(/[_:.]+/g, " ").trim() || (tr ? "bir işlem yaptı" : "did something");
}

const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Audit targets that are raw ids read as noise; keep names, drop ids. */
export function auditTargetLabel(target) {
  const s = String(target ?? "").trim();
  if (!s || s === "null" || UUIDISH.test(s) || /^\d{6,}$/.test(s)) return "";
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}
