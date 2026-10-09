"use strict";

/**
 * Moderation alert email: every new user report (message / profile / member
 * list / DM list / LFG) emails the owner via the shared Resend sender.
 *
 * Fire-and-forget by design: scheduleReportAlert() returns immediately and the
 * send runs on a later tick, so a slow or failing Resend call can never block
 * or fail the report request. Errors are caught and logged.
 *
 * Flood protection (in-memory, single Render instance):
 *   - at most 1 email per reporter+target (or reporter+lobby) per 10 minutes
 *   - at most REPORT_ALERT_MAX_PER_HOUR emails per rolling hour (default 20)
 *   Suppressed alerts are counted and summarized in the next email that goes
 *   out; every report is still in the admin panel.
 *
 * Env: REPORT_ALERT_EMAIL (default demirkurtlar@icloud.com),
 *      REPORT_ALERT_MAX_PER_HOUR, REPORT_ALERT_ADMIN_URL, PUBLIC_APP_URL,
 *      plus RESEND_API_KEY / FEEDBACK_EMAIL_FROM / EMAIL_FROM used by mailer.js.
 */

const { sendEmail: defaultSendEmail, SUPPORT_EMAIL } = require("./mailer");

const DEFAULT_RECIPIENT = "demirkurtlar@icloud.com";
const PAIR_WINDOW_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_MAX_PER_HOUR = 20;
const MAX_CONTENT = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASON_TR = {
  harassment: "Taciz",
  hate_speech: "Nefret söylemi",
  threats: "Tehdit",
  spam: "Spam",
  scam: "Dolandırıcılık",
  impersonation: "Taklit",
  nsfw: "Cinsel içerik",
  doxxing: "Mahremiyet / doxxing",
  other: "Diğer",
};

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Keep subjects single-line and short; user text must not inject headers. */
function oneLine(value, max = 80) {
  return String(value == null ? "" : value).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function reasonTr(id) {
  return REASON_TR[id] || REASON_TR.other;
}

function istanbulStamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(date.getTime())) return null;
  try {
    return (
      new Intl.DateTimeFormat("tr-TR", {
        timeZone: "Europe/Istanbul",
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(date) + " (TSİ)"
    );
  } catch {
    return date.toISOString();
  }
}

/** Human label for where the report came from (message vs. user list entry). */
function reportTypeLabel({ contextType, contextId, kind }) {
  if (kind === "lfg_lobby") return "LFG lobisi";
  const hasMsg = Boolean(contextId);
  switch (contextType) {
    case "dm":
      return hasMsg ? "Mesaj (DM)" : "Kullanıcı (DM listesi)";
    case "group":
      return hasMsg ? "Mesaj (grup sohbeti)" : "Kullanıcı (grup)";
    case "server":
      return hasMsg ? "Mesaj (sunucu kanalı)" : "Kullanıcı (sunucu üye listesi)";
    case "profile":
      return "Kullanıcı profili";
    case "lfg":
      return "LFG lobisindeki oyuncu";
    default:
      return "Diğer";
  }
}

function adminUrl(env = process.env) {
  if (env.REPORT_ALERT_ADMIN_URL) return String(env.REPORT_ALERT_ADMIN_URL);
  const origin = String(env.PUBLIC_APP_URL || "https://descall.com").replace(/\/$/, "");
  return `${origin}/app`;
}

function userLine(user, id) {
  if (!user && !id) return "—";
  const handle = user?.username ? `@${user.username}` : "(kullanıcı bulunamadı)";
  const display = user?.display_name && user.display_name !== user.username ? ` (${user.display_name})` : "";
  return `${handle}${display} · ID ${id || user?.id || "—"}`;
}

/**
 * Pure builder: { subject, text, html }. Every user-controlled value is
 * HTML-escaped in html and flattened in the subject.
 */
function buildReportAlertEmail({
  report = {},
  reporter = null,
  target = null,
  message = null,
  lobby = null,
  priorCount = null,
  openCount = null,
  throttleNote = null,
  env = process.env,
} = {}) {
  const reason = report.reason || "other";
  const typeLabel = reportTypeLabel({ contextType: report.contextType, contextId: report.contextId, kind: report.kind });
  const targetHandle = target?.username ? `@${oneLine(target.username, 40)}` : report.kind === "lfg_lobby" ? "LFG lobisi" : "bilinmeyen kullanıcı";
  const subject = `🚩 Yeni şikayet: ${reasonTr(reason)} — ${targetHandle}`;
  const link = adminUrl(env);

  const rows = [
    ["Şikayet ID", report.id || "—"],
    ["Tür", typeLabel],
    ["Sebep", `${reasonTr(reason)} (${reason})`],
    ["Ek açıklama", report.note || "—"],
    ["Şikayet eden", userLine(reporter, report.reporterId)],
    ["Şikayet edilen", report.kind === "lfg_lobby" && !report.targetId ? "— (lobi şikayeti)" : userLine(target, report.targetId)],
    ["Şikayet zamanı", istanbulStamp(report.createdAt || new Date()) || "—"],
  ];
  if (report.kind !== "lfg_lobby") {
    rows.push([
      "Önceki şikayetler",
      priorCount == null
        ? "bilinmiyor"
        : `${priorCount} (bu kullanıcıya karşı, bu şikayet hariç)${openCount != null ? ` · açık: ${openCount}` : ""}`,
    ]);
  }

  const ctxRows = [];
  let content = null;
  if (message) {
    if (message.where) ctxRows.push(["Yer", message.where]);
    if (message.senderLabel) ctxRows.push(["Gönderen", message.senderLabel]);
    ctxRows.push(["Mesaj zamanı", istanbulStamp(message.createdAt) || "—"]);
    ctxRows.push(["Mesaj ID", report.contextId || "—"]);
    content = message.content;
  } else if (report.contextId) {
    ctxRows.push(["Bağlam ID", report.contextId]);
    if (report.occurredAt) ctxRows.push(["Mesaj zamanı", istanbulStamp(report.occurredAt) || "—"]);
  }
  if (lobby) {
    ctxRows.push(["Lobi", lobby]);
  }
  if (content == null && report.snippet) {
    content = report.snippet;
    ctxRows.push(["Kaynak", "Mesaj veritabanında bulunamadı; istemcinin gönderdiği alıntı gösteriliyor"]);
  }
  const contentText = content == null ? null : String(content).slice(0, MAX_CONTENT);

  const text = [
    subject,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(ctxRows.length ? ["", "Bağlam", ...ctxRows.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(contentText != null ? ["", "Mesaj içeriği (ham, maskesiz):", contentText] : []),
    ...(throttleNote ? ["", `Not: ${throttleNote}`] : []),
    "",
    `Yönetici paneli: ${link}`,
    "(Descall logosu → Yönetici Paneli → Raporlar)",
  ].join("\n");

  const tr = ([k, v]) =>
    `<tr><td style="padding:9px 14px;border-bottom:1px solid #242a36;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8b93a7;width:150px;vertical-align:top;">${escapeHtml(k)}</td>` +
    `<td style="padding:9px 14px;border-bottom:1px solid #242a36;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#e8ebf2;vertical-align:top;word-break:break-word;">${escapeHtml(v)}</td></tr>`;

  const section = (title, body) =>
    `<tr><td style="padding:18px 24px 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#9db0ff;">${escapeHtml(title)}</td></tr>` +
    `<tr><td style="padding:0 10px 6px;">${body}</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#0b0d12;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d12;padding:28px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:600px;">
        <tr><td style="padding:0 0 14px 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#9db0ff;">Descall · Moderasyon</td></tr>
        <tr><td style="background:#141821;border:1px solid #242a36;border-radius:16px;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:22px 24px 8px;font-family:Arial,Helvetica,sans-serif;background:#2a1820;">
              <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#ff9db0;">🚩 Yeni şikayet · ${escapeHtml(typeLabel)}</p>
              <h1 style="margin:8px 0 6px;font-size:22px;line-height:1.3;color:#fff;">${escapeHtml(reasonTr(reason))} — ${escapeHtml(targetHandle)}</h1>
            </td></tr>
            ${section("Şikayet", `<table role="presentation" width="100%" style="border-collapse:collapse;">${rows.map(tr).join("")}</table>`)}
            ${ctxRows.length ? section("Bağlam", `<table role="presentation" width="100%" style="border-collapse:collapse;">${ctxRows.map(tr).join("")}</table>`) : ""}
            ${
              contentText != null
                ? section(
                    "Mesaj içeriği (ham, maskesiz)",
                    `<div style="margin:4px 4px 8px;padding:14px 16px;background:#0f1117;border:1px solid #242a36;border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.55;color:#f4f6fb;white-space:pre-wrap;word-break:break-word;">${escapeHtml(contentText)}</div>`
                  )
                : ""
            }
            ${
              throttleNote
                ? `<tr><td style="padding:8px 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#f0b232;">⚠️ ${escapeHtml(throttleNote)}</td></tr>`
                : ""
            }
            <tr><td style="padding:18px 24px 24px;">
              <a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 18px;background:#5865f2;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Yönetici panelini aç</a>
              <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8b93a7;">Descall logosu → Yönetici Paneli → Raporlar</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:16px 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6d7485;">
          Otomatik moderasyon bildirimi · ${escapeHtml(SUPPORT_EMAIL)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

async function safeSingle(query) {
  try {
    const { data, error } = await query;
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

async function loadUsers(supabase, ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return {};
  const rows = await safeSingle(supabase.from("users").select("id, username, display_name").in("id", unique));
  const map = {};
  for (const u of rows || []) map[String(u.id)] = u;
  return map;
}

/** Best-effort lookup of the reported message (raw content) and where it lives. */
async function loadMessageContext(supabase, { contextType, contextId }) {
  if (!contextId || !UUID_RE.test(String(contextId))) return null;
  const id = String(contextId);
  if (contextType === "dm") {
    const row = await safeSingle(
      supabase.from("dm_messages").select("id, from_user_id, to_user_id, content, created_at").eq("id", id).maybeSingle()
    );
    if (!row) return null;
    const users = await loadUsers(supabase, [row.from_user_id, row.to_user_id]);
    const a = users[String(row.from_user_id)];
    const b = users[String(row.to_user_id)];
    return {
      content: row.content,
      createdAt: row.created_at,
      senderLabel: userLine(a, row.from_user_id),
      where: `DM: @${a?.username || row.from_user_id} → @${b?.username || row.to_user_id}`,
    };
  }
  if (contextType === "group") {
    const row = await safeSingle(
      supabase.from("group_messages").select("id, group_id, sender_id, content, created_at").eq("id", id).maybeSingle()
    );
    if (!row) return null;
    const group = await safeSingle(supabase.from("groups").select("id, name").eq("id", row.group_id).maybeSingle());
    const users = await loadUsers(supabase, [row.sender_id]);
    return {
      content: row.content,
      createdAt: row.created_at,
      senderLabel: userLine(users[String(row.sender_id)], row.sender_id),
      where: `Grup: ${group?.name || "—"} · ID ${row.group_id}`,
    };
  }
  if (contextType === "server") {
    const row = await safeSingle(
      supabase
        .from("server_messages")
        .select("id, server_id, channel_id, sender_id, content, created_at")
        .eq("id", id)
        .maybeSingle()
    );
    if (!row) return null;
    const [server, channel, users] = await Promise.all([
      safeSingle(supabase.from("servers").select("id, name").eq("id", row.server_id).maybeSingle()),
      safeSingle(supabase.from("server_channels").select("id, name").eq("id", row.channel_id).maybeSingle()),
      loadUsers(supabase, [row.sender_id]),
    ]);
    return {
      content: row.content,
      createdAt: row.created_at,
      senderLabel: userLine(users[String(row.sender_id)], row.sender_id),
      where: `Sunucu: ${server?.name || "—"} · #${channel?.name || "—"} (sunucu ${row.server_id}, kanal ${row.channel_id})`,
    };
  }
  return null;
}

async function loadLobbyLabel(supabase, lobbyId) {
  if (!lobbyId || !UUID_RE.test(String(lobbyId))) return lobbyId ? String(lobbyId) : null;
  const row = await safeSingle(supabase.from("lfg_lobbies").select("*").eq("id", String(lobbyId)).maybeSingle());
  if (!row) return String(lobbyId);
  const bits = [row.title || row.name, row.mode, row.region].filter(Boolean).join(" · ");
  return `${bits || "Lobi"} · ID ${lobbyId}`;
}

async function countPriorReports(supabase, targetId, reportId) {
  if (!targetId) return null;
  try {
    let q = supabase.from("user_reports").select("id", { count: "exact", head: true }).eq("target_id", targetId);
    if (reportId) q = q.neq("id", reportId);
    const { count, error } = await q;
    if (error) return null;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

/**
 * Factory so tests can inject a clock, a mocked sender and a fake supabase.
 */
function createReportAlerter({
  sendEmail = defaultSendEmail,
  getSupabase = () => require("../db/supabase"),
  now = () => Date.now(),
  env = process.env,
  logger = console,
} = {}) {
  const lastByPair = new Map();
  let sentTimes = [];
  let suppressed = 0;

  function maxPerHour() {
    const n = Number(env.REPORT_ALERT_MAX_PER_HOUR);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_PER_HOUR;
  }

  /** Synchronous gate (no awaits) so concurrent reports can't race past it. */
  function admit(pairKey) {
    const t = now();
    sentTimes = sentTimes.filter((ts) => t - ts < HOUR_MS);
    for (const [k, ts] of lastByPair) if (t - ts >= PAIR_WINDOW_MS) lastByPair.delete(k);
    if (lastByPair.has(pairKey)) {
      suppressed += 1;
      return { ok: false, why: "pair" };
    }
    const cap = maxPerHour();
    if (sentTimes.length >= cap) {
      suppressed += 1;
      return { ok: false, why: "global" };
    }
    lastByPair.set(pairKey, t);
    sentTimes.push(t);
    const notes = [];
    if (suppressed > 0) {
      notes.push(`Son gönderilen e-postadan beri ${suppressed} şikayet e-postası limit nedeniyle gönderilmedi; hepsi yönetici panelinde.`);
      suppressed = 0;
    }
    if (sentTimes.length === cap) {
      notes.push(`Saatlik e-posta limitine (${cap}) ulaşıldı; bu saatteki diğer şikayetler yalnızca yönetici panelinde görünecek.`);
    }
    return { ok: true, note: notes.join(" ") || null };
  }

  async function notify(input = {}) {
    const report = input.report || {};
    const pairKey = `${report.reporterId || "?"}:${report.targetId || `lobby:${report.contextId || "?"}`}`;
    const gate = admit(pairKey);
    if (!gate.ok) {
      logger.log?.(`[report-alert] skipped (${gate.why} limit) report ${report.id || "?"}`);
      return { sent: false, throttled: gate.why };
    }
    try {
      const supabase = getSupabase();
      const [users, message, priorCount, lobby] = await Promise.all([
        loadUsers(supabase, [report.reporterId, report.targetId]),
        loadMessageContext(supabase, report),
        report.kind === "lfg_lobby" ? null : countPriorReports(supabase, report.targetId, report.id),
        report.contextType === "lfg" || report.kind === "lfg_lobby" ? loadLobbyLabel(supabase, report.contextId) : null,
      ]);
      const email = buildReportAlertEmail({
        report,
        reporter: users[String(report.reporterId)] || null,
        target: users[String(report.targetId)] || null,
        message,
        lobby,
        priorCount,
        openCount: input.openCount ?? null,
        throttleNote: gate.note,
        env,
      });
      const result = await sendEmail(
        {
          to: env.REPORT_ALERT_EMAIL || DEFAULT_RECIPIENT,
          subject: email.subject,
          text: email.text,
          html: email.html,
          replyTo: SUPPORT_EMAIL,
        },
        { env }
      );
      if (result?.skipped) logger.warn?.("[report-alert] email not configured, skipped");
      else logger.log?.(`[report-alert] sent for report ${report.id || "?"} ${result?.providerId || ""}`);
      return result;
    } catch (err) {
      logger.warn?.("[report-alert] send failed:", err?.message || err);
      return { sent: false, error: String(err?.message || err).slice(0, 200) };
    }
  }

  /** Fire-and-forget: returns immediately, never throws. */
  function schedule(input) {
    try {
      setImmediate(() => {
        notify(input).catch((err) => logger.warn?.("[report-alert] unexpected:", err?.message || err));
      });
    } catch (err) {
      logger.warn?.("[report-alert] schedule failed:", err?.message || err);
    }
  }

  return { notify, schedule, admit };
}

const defaultAlerter = createReportAlerter();

function scheduleReportAlert(input) {
  defaultAlerter.schedule(input);
}

module.exports = {
  buildReportAlertEmail,
  createReportAlerter,
  scheduleReportAlert,
  reportTypeLabel,
  escapeHtml,
  istanbulStamp,
  DEFAULT_RECIPIENT,
};
