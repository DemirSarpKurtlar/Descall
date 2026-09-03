"use strict";

const { sendEmail, SUPPORT_EMAIL } = require("./mailer");
const { displayValue, resolveAuthMethod, geoFromHeaders } = require("./signupAttribution");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatStamp(date = new Date(), timeZone = "UTC", locale = "tr-TR") {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function istanbulStamp(date = new Date()) {
  return formatStamp(date, "Europe/Istanbul", "tr-TR");
}

function shortUa(ua) {
  const raw = String(ua || "").trim();
  if (!raw) return "—";
  const mobile = /Mobile|Android|iPhone|iPad/i.test(raw);
  let browser = "Tarayıcı";
  if (/Edg\//i.test(raw)) browser = "Edge";
  else if (/Chrome\//i.test(raw) && !/Edg\//i.test(raw)) browser = "Chrome";
  else if (/Firefox\//i.test(raw)) browser = "Firefox";
  else if (/Safari\//i.test(raw) && !/Chrome\//i.test(raw)) browser = "Safari";
  return `${mobile ? "Mobil" : "Desktop"} · ${browser}`;
}

function clientIp(req) {
  const xf = String(req?.headers?.["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return xf || String(req?.ip || "").trim() || "";
}

function buildSignupSubject({ username, email }) {
  const handle = String(username || "").trim();
  if (handle) return `Descall · Yeni kullanıcı — @${handle}`;
  const mail = String(email || "").trim();
  return mail ? `Descall · Yeni kullanıcı — ${mail}` : "Descall · Yeni kullanıcı";
}

function authLabel(method, attribution) {
  const resolved = resolveAuthMethod(attribution?.auth_method || method);
  if (resolved === "google") return "Google";
  if (resolved === "email") return "Email";
  return "Other";
}

function buildSignupReport({
  user,
  method,
  invitedBy,
  req,
  verified,
  onboarding,
  attribution,
} = {}) {
  const id = user?.id || "—";
  const username = user?.username || "";
  const displayName = user?.display_name || user?.displayName || username || "—";
  const email = user?.email || "—";
  const attr = attribution && typeof attribution === "object" ? attribution : {};
  const whenIso = attr.signup_at || new Date().toISOString();
  const whenDate = new Date(whenIso);
  const whenSafe = Number.isNaN(whenDate.getTime()) ? new Date() : whenDate;
  const geo = geoFromHeaders(req?.headers);
  const place = geo.place || displayValue(attr.signup_country, "Unknown");
  const whenTr = istanbulStamp(whenSafe);
  const methodLabel = method === "google" ? "Google" : "Email";
  const source = invitedBy ? `Davet · @${invitedBy}` : "Organik";
  const ua = shortUa(req?.headers?.["user-agent"]);
  const lang = String(req?.headers?.["accept-language"] || "")
    .split(",")[0]
    .trim()
    .slice(0, 32) || "—";
  const ip = clientIp(req).slice(0, 64) || "—";
  const verifiedLabel = verified ? "E-posta doğrulandı" : "Doğrulama bekliyor";
  const onboard = onboarding || (method === "google" ? "Google ile giriş" : "Kayıt tamam");

  const rows = [
    ["Kullanıcı", `${displayName} · @${username || "—"} · ${email}`],
    ["ID", String(id)],
    ["Kayıt yeri", place],
    ["Kayıt saati", `${whenTr} (Türkiye)`],
    ["Yöntem", methodLabel],
    ["Kaynak", source],
    ["Cihaz", `${ua} · dil ${lang}`],
    ["IP", ip],
    ["Durum", `${verifiedLabel} · ${onboard}`],
    ["User", displayValue(email, "Unknown")],
    ["Authentication", authLabel(method, attr)],
    ["Acquisition", displayValue(attr.first_touch_source, "Unknown")],
    ["Campaign", displayValue(attr.first_touch_campaign, "Unknown")],
    ["Referrer", displayValue(attr.first_touch_referrer || attr.last_touch_referrer, "Unknown")],
    ["Device", displayValue(attr.signup_device, "Unknown")],
    ["OS", displayValue(attr.signup_os, "Unknown")],
    ["Country", displayValue(attr.signup_country || geo.country, "Unknown")],
    ["Landing Page", displayValue(attr.first_touch_landing_page || attr.last_touch_landing_page, "Unknown")],
    ["First Visit", displayValue(attr.first_touch_at, "Unknown")],
    ["Signup", displayValue(whenIso, "Unknown")],
    ["First Touch", displayValue(attr.first_touch_source, "Unknown")],
    ["Last Touch", displayValue(attr.last_touch_source, "Unknown")],
    ["First Touch Source", displayValue(attr.first_touch_source)],
    ["First Touch Medium", displayValue(attr.first_touch_medium)],
    ["First Touch Campaign", displayValue(attr.first_touch_campaign)],
    ["Last Touch Source", displayValue(attr.last_touch_source)],
    ["Last Touch Medium", displayValue(attr.last_touch_medium)],
    ["Last Touch Campaign", displayValue(attr.last_touch_campaign)],
    ["GCLID", displayValue(attr.first_touch_gclid || attr.last_touch_gclid)],
    ["Signup Conversion", "Yes"],
    ["First Action", "Not yet"],
    ["App Opened", "No"],
    ["First Message", "No"],
  ];

  const text = [
    "Descall — yeni kullanıcı raporu",
    ...rows.map(([k, v]) => `${k}: ${v}`),
  ].join("\n");

  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr>` +
        `<td style="padding:10px 14px;border-bottom:1px solid #242a36;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8b93a7;width:168px;vertical-align:top;">${escapeHtml(k)}</td>` +
        `<td style="padding:10px 14px;border-bottom:1px solid #242a36;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#e8ebf2;vertical-align:top;">${escapeHtml(v)}</td>` +
        `</tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(buildSignupSubject({ username, email }))}</title></head>
<body style="margin:0;padding:0;background:#0b0d12;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d12;padding:28px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;">
        <tr><td style="padding:0 0 14px 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#9db0ff;">Descall · Yeni üye</td></tr>
        <tr><td style="background:#141821;border:1px solid #242a36;border-radius:16px;overflow:hidden;">
          <table role="presentation" width="100%">
            <tr><td style="padding:22px 24px 8px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9db0ff;">Signup raporu</p>
              <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:#fff;">@${escapeHtml(username || email || "user")}</h1>
            </td></tr>
            <tr><td style="padding:8px 10px 18px;">
              <table role="presentation" width="100%" style="border-collapse:collapse;">${tableRows}</table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:16px 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6d7485;">
          Otomatik bildirim · ${escapeHtml(SUPPORT_EMAIL)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    subject: buildSignupSubject({ username, email }),
    text,
    html,
  };
}

/**
 * Best-effort team notify. Never throws.
 * @returns {Promise<{ sent: boolean, providerId?: string|null, skipped?: boolean, error?: string }>}
 */
async function notifyTeamNewSignup(opts = {}) {
  try {
    const to = process.env.SIGNUP_NOTIFY_TO || "team@descall.com";
    const { subject, text, html } = buildSignupReport(opts);
    const result = await sendEmail({
      to,
      subject,
      text,
      html,
      replyTo: SUPPORT_EMAIL,
    });
    if (result?.providerId) {
      console.log("[AUTH] signup team report sent", result.providerId);
    }
    return result;
  } catch (err) {
    console.warn("[AUTH] signup team report failed:", err?.message || err);
    return { sent: false, error: String(err?.message || err).slice(0, 200) };
  }
}

module.exports = {
  notifyTeamNewSignup,
  buildSignupReport,
  buildSignupSubject,
  shortUa,
  istanbulStamp,
  formatStamp,
};
