"use strict";

/**
 * Team notification for a new account (3.7.9, rewritten).
 *
 * One Turkish email per sign-up, in the same visual shell as the code emails
 * (lib/emailTemplates.js): hidden preheader, header card with the person,
 * a summary strip (today's sign-up number, total members), then grouped
 * sections (Kimlik, Nereden geldi, Cihaz ve konum, Güvenlik sinyalleri) and a
 * button to the admin panel. Plain-text twin. No emoji (owner rule).
 *
 * Context numbers come from `loadSignupContext` (best effort, 2.5 s budget):
 * a missing number is simply left out, the email always goes.
 */

const { sendEmail, SUPPORT_EMAIL } = require("./mailer");
const { escapeHtml } = require("./emailUtil");
const { displayValue, resolveAuthMethod, geoFromHeaders, parseUserAgent } = require("./signupAttribution");

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const C = {
  page: "#0b0d12",
  card: "#12151d",
  inset: "#0e1118",
  edge: "#232937",
  ink: "#f4f6fb",
  body: "#c3c8d4",
  muted: "#8a91a3",
  faint: "#5d6475",
  brand: "#6c86ff",
  brandSoft: "#9db0ff",
  ok: "#7fd6a4",
  okBg: "#132a1f",
  okEdge: "#24503a",
  warn: "#f3c99b",
  warnBg: "#2a1d14",
  warnEdge: "#5a3b22",
  bad: "#ff9b9b",
  badBg: "#2c1517",
  badEdge: "#5e2a2e",
};
const LOGO = "https://descall.com/brand/descall-icon.png";

const SOURCE_LABELS = {
  direct: "Doğrudan giriş",
  google_organic: "Google araması",
  google_ads: "Google Ads reklamı",
  bing_organic: "Bing araması",
  bing_ads: "Bing reklamı",
  yahoo: "Yahoo araması",
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "X (Twitter)",
  facebook: "Facebook",
  youtube: "YouTube",
  reddit: "Reddit",
  discord: "Discord",
  referral: "Davet bağlantısı",
  other: "Başka bir site",
};
const OS_LABELS = { ios: "iOS", android: "Android", windows: "Windows", macos: "macOS", linux: "Linux" };
const BROWSER_LABELS = { chrome: "Chrome", safari: "Safari", firefox: "Firefox", edge: "Edge" };
const DEVICE_LABELS = { mobile: "Telefon", tablet: "Tablet", desktop: "Bilgisayar" };

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "yopmail.com",
  "tempmail.com",
  "temp-mail.org",
  "temp-mail.io",
  "10minutemail.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "sharklasers.com",
  "trashmail.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "throwawaymail.com",
  "fakeinbox.com",
  "emailondeck.com",
  "mohmal.com",
  "tempmailo.com",
  "minuteinbox.com",
  "moakt.com",
]);

function formatStamp(date = new Date(), timeZone = "UTC", locale = "tr-TR") {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(date);
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
  return `${mobile ? "Mobil" : "Masaüstü"} · ${browser}`;
}

// req.ip = visitor (trust proxy, lib/clientIp.js); never the client-written first XFF value.
function clientIp(req) {
  return String(req?.ip || "").trim().slice(0, 64);
}

function methodKey(method, attribution) {
  const raw = String(method || attribution?.auth_method || "").toLowerCase();
  if (raw === "apple") return "apple";
  const resolved = resolveAuthMethod(raw);
  return resolved === "google" ? "google" : resolved === "email" ? "email" : "other";
}

function methodLabel(key) {
  return { google: "Google", apple: "Apple", email: "E-posta ve şifre" }[key] || "Diğer";
}

function sourceLabel(source) {
  const key = String(source || "").trim().toLowerCase();
  if (!key) return "Bilinmiyor";
  return SOURCE_LABELS[key] || key;
}

function emailDomain(email) {
  const m = /@([^@\s]+)$/.exec(String(email || "").trim().toLowerCase());
  return m ? m[1] : "";
}

function isDisposableDomain(domain) {
  const d = String(domain || "").toLowerCase();
  if (!d) return false;
  if (DISPOSABLE_DOMAINS.has(d)) return true;
  for (const base of DISPOSABLE_DOMAINS) if (d.endsWith(`.${base}`)) return true;
  return false;
}

/** "3 dk", "2 sa 5 dk", "4 gün" between first visit and sign-up; "" when unknown. */
function journeyLength(firstAt, signupAt) {
  if (!firstAt || !signupAt) return "";
  const a = new Date(firstAt).getTime();
  const b = new Date(signupAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return "";
  const min = Math.round((b - a) / 60000);
  if (min < 1) return "1 dakikadan kısa";
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `${h} sa ${min % 60} dk` : `${h} sa`;
  return `${Math.round(h / 24)} gün`;
}

function shortUrl(value, max = 70) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const noProto = raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return noProto.length > max ? `${noProto.slice(0, max - 1)}…` : noProto;
}

function nf(n) {
  return Number(n).toLocaleString("tr-TR");
}

function adminUrl(env = process.env) {
  const base = String(env.SIGNUP_NOTIFY_ADMIN_URL || env.REPORT_ALERT_ADMIN_URL || "").trim();
  if (base) return base;
  return `${String(env.PUBLIC_APP_URL || "https://descall.com").replace(/\/+$/, "")}/app`;
}

function buildSignupSubject({ username, email, method, country, ordinal } = {}) {
  const handle = String(username || "").trim();
  const who = handle ? `@${handle}` : String(email || "").trim() || "yeni hesap";
  const parts = [`Yeni üye: ${who}`];
  if (method) parts.push(methodLabel(method));
  if (country) parts.push(String(country).toUpperCase());
  if (Number.isFinite(ordinal) && ordinal > 0) parts.push(`bugün ${ordinal}.`);
  return parts.join(" · ");
}

/**
 * Pure model of the report: every value is already a display string.
 * `context` = { todayCount, totalUsers, sameIpCount, sameDeviceCount } (any may be missing).
 */
function signupModel({ user, method, invitedBy, req, verified, onboarding, attribution, context } = {}) {
  const attr = attribution && typeof attribution === "object" ? attribution : {};
  const ctx = context && typeof context === "object" ? context : {};
  const headers = req?.headers || {};
  const username = String(user?.username || "").trim();
  const displayName = String(user?.display_name || user?.displayName || username || "").trim();
  const email = String(user?.email || "").trim();
  const domain = emailDomain(email);
  const mKey = methodKey(method, attr);

  const signupDate = new Date(attr.signup_at || Date.now());
  const when = Number.isNaN(signupDate.getTime()) ? new Date() : signupDate;
  const geo = geoFromHeaders(headers);
  const country = String(attr.signup_country || geo.country || "").toUpperCase();
  const place = geo.place || country || "";
  const ua = parseUserAgent(headers["user-agent"]);
  const device = attr.signup_device || (headers["user-agent"] ? ua.device : "");
  const os = attr.signup_os || (headers["user-agent"] ? ua.os : "");
  const browser = attr.signup_browser || (headers["user-agent"] ? ua.browser : "");
  const deviceLine = [DEVICE_LABELS[device], OS_LABELS[os], BROWSER_LABELS[browser]].filter(Boolean).join(" · ");
  const language = String(headers["accept-language"] || "").split(",")[0].trim().slice(0, 32);
  const ip = clientIp(req);

  const firstSource = attr.first_touch_source || (invitedBy ? "referral" : "");
  const lastSource = attr.last_touch_source || "";
  const gclid = attr.first_touch_gclid || attr.last_touch_gclid || "";
  const referrer = attr.first_touch_referrer || attr.last_touch_referrer || "";
  const landing = attr.first_touch_landing_page || attr.last_touch_landing_page || "";
  const campaign = attr.first_touch_campaign || attr.last_touch_campaign || "";
  const medium = attr.first_touch_medium || "";
  const journey = journeyLength(attr.first_touch_at, when);

  const ordinal = Number.isFinite(Number(ctx.todayCount)) && Number(ctx.todayCount) > 0 ? Number(ctx.todayCount) : null;
  const total = Number.isFinite(Number(ctx.totalUsers)) && Number(ctx.totalUsers) > 0 ? Number(ctx.totalUsers) : null;
  const sameIp = Number.isFinite(Number(ctx.sameIpCount)) ? Number(ctx.sameIpCount) : null;
  const sameDevice = Number.isFinite(Number(ctx.sameDeviceCount)) ? Number(ctx.sameDeviceCount) : null;

  const identity = [
    ["Kayıt yöntemi", methodLabel(mKey)],
    ["E-posta", email ? `${email}` : "Girilmedi"],
    ["E-posta durumu", !email ? "E-posta yok" : verified ? "Doğrulandı" : "Doğrulama bekliyor"],
    ["Sonraki adım", onboarding || (mKey === "email" ? (email ? "E-posta doğrulama" : "Kayıt tamam") : "Giriş yapıldı")],
    ["Davet eden", invitedBy ? `@${invitedBy}` : "Yok"],
    ["Hesap kimliği", String(user?.id || "—")],
  ];

  const origin = [
    ["İlk geldiği yer", sourceLabel(firstSource)],
  ];
  if (lastSource && lastSource !== firstSource) origin.push(["Kayıttan önce son", sourceLabel(lastSource)]);
  if (medium && medium !== "none") origin.push(["Kanal", medium]);
  if (campaign) origin.push(["Kampanya", campaign]);
  if (gclid) origin.push(["Google Ads tıklaması", "Var (GCLID kayıtlı)"]);
  if (referrer) origin.push(["Yönlendiren sayfa", shortUrl(referrer)]);
  if (landing) origin.push(["İlk açtığı sayfa", shortUrl(landing)]);
  if (attr.first_touch_at) origin.push(["İlk ziyaret", `${istanbulStamp(new Date(attr.first_touch_at))}`]);
  if (journey) origin.push(["Kayıt olana kadar", journey]);

  const where = [
    ["Cihaz", deviceLine || shortUa(headers["user-agent"])],
    ["Konum", place || "Bilinmiyor"],
    ["Dil", language || "Bilinmiyor"],
    ["IP adresi", ip || "Bilinmiyor"],
    ["Kayıt saati", `${istanbulStamp(when)} (Türkiye saati)`],
  ];

  /** @type {{tone: "ok"|"warn"|"bad", label: string}[]} */
  const signals = [];
  if (domain && isDisposableDomain(domain)) signals.push({ tone: "bad", label: `Geçici e-posta servisi (${domain})` });
  if (sameDevice && sameDevice > 0) signals.push({ tone: "bad", label: `Aynı tarayıcıdan ${sameDevice} hesap daha var` });
  if (sameIp && sameIp >= 3) signals.push({ tone: "bad", label: `Son 24 saatte aynı IP'den ${sameIp} kayıt daha` });
  else if (sameIp && sameIp > 0) signals.push({ tone: "warn", label: `Son 24 saatte aynı IP'den ${sameIp} kayıt daha` });
  if (!email && mKey === "email") signals.push({ tone: "warn", label: "E-posta girmeden kayıt oldu" });
  if (email && !verified && mKey === "email") signals.push({ tone: "warn", label: "E-posta henüz doğrulanmadı" });
  if (journey === "1 dakikadan kısa" && !invitedBy) signals.push({ tone: "warn", label: "Siteye girdiği dakika içinde kayıt oldu" });
  if (!signals.some((s) => s.tone === "bad")) {
    if (invitedBy) signals.push({ tone: "ok", label: `@${invitedBy} davet etti` });
    if (verified && email) signals.push({ tone: "ok", label: "Doğrulanmış e-posta" });
    if (mKey === "google" || mKey === "apple") signals.push({ tone: "ok", label: `${methodLabel(mKey)} hesabıyla geldi` });
  }
  const risk = signals.some((s) => s.tone === "bad") ? "bad" : signals.some((s) => s.tone === "warn") ? "warn" : "ok";

  const subject = buildSignupSubject({ username, email, method: mKey, country, ordinal });
  const preheader = [
    username ? `@${username}` : email || "Yeni hesap",
    methodLabel(mKey),
    place || null,
    sourceLabel(firstSource),
    risk === "bad" ? "Kontrol et" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    subject,
    preheader,
    username,
    displayName: displayName || username || email || "Yeni üye",
    email,
    initial: (displayName || username || email || "?").trim().charAt(0).toLocaleUpperCase("tr") || "?",
    methodText: methodLabel(mKey),
    verified: Boolean(verified && email),
    ordinal,
    total,
    whenShort: formatStamp(when, "Europe/Istanbul", "tr-TR"),
    place,
    sections: [
      { title: "Kimlik", rows: identity },
      { title: "Nereden geldi", rows: origin },
      { title: "Cihaz ve konum", rows: where },
    ],
    signals,
    risk,
    adminHref: adminUrl(),
  };
}

function chip(text, tone) {
  const t = {
    ok: [C.okBg, C.okEdge, C.ok],
    warn: [C.warnBg, C.warnEdge, C.warn],
    bad: [C.badBg, C.badEdge, C.bad],
    brand: ["#1b2340", "#2c3970", C.brandSoft],
    plain: ["#1a1f2c", C.edge, C.body],
  }[tone] || ["#1a1f2c", C.edge, C.body];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:0 6px 6px 0;vertical-align:top;"><tr><td bgcolor="${t[0]}" style="background-color:${t[0]};border:1px solid ${t[1]};border-radius:999px;padding:5px 11px;font-family:${FONT};font-size:12.5px;font-weight:600;color:${t[2]};white-space:nowrap;">${escapeHtml(text)}</td></tr></table>`;
}

function statCell(value, label) {
  return `<td width="33%" valign="top" style="padding:14px 10px;text-align:center;">
    <p style="margin:0;font-family:${FONT};font-size:20px;line-height:1.2;font-weight:750;color:${C.ink};">${escapeHtml(value)}</p>
    <p style="margin:4px 0 0;font-family:${FONT};font-size:11.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${C.muted};">${escapeHtml(label)}</p>
  </td>`;
}

function sectionBlock(section) {
  const rows = section.rows
    .map(
      ([k, v], i) => `<tr>
        <td class="k" valign="top" style="padding:10px 12px 10px 0;${i ? `border-top:1px solid ${C.edge};` : ""}font-family:${FONT};font-size:13px;line-height:1.55;color:${C.muted};width:150px;">${escapeHtml(k)}</td>
        <td valign="top" style="padding:10px 0;${i ? `border-top:1px solid ${C.edge};` : ""}font-family:${FONT};font-size:14px;line-height:1.45;color:${C.ink};word-break:break-word;">${escapeHtml(displayValue(v, "—"))}</td>
      </tr>`
    )
    .join("");
  return `<tr><td class="px" style="padding:6px 28px 14px;">
    <p style="margin:12px 0 8px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.brandSoft};">${escapeHtml(section.title)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.inset}" style="background-color:${C.inset};border:1px solid ${C.edge};border-radius:14px;">
      <tr><td style="padding:4px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
      </td></tr>
    </table>
  </td></tr>`;
}

function renderHtml(m, year) {
  const riskHead = {
    ok: ["Temiz görünüyor", C.okBg, C.okEdge, C.ok],
    warn: ["Göz atmakta fayda var", C.warnBg, C.warnEdge, C.warn],
    bad: ["Kontrol et", C.badBg, C.badEdge, C.bad],
  }[m.risk];
  const statusChips =
    chip(m.methodText, "brand") +
    chip(m.email ? (m.verified ? "E-posta doğrulandı" : "Doğrulama bekliyor") : "E-posta yok", m.email ? (m.verified ? "ok" : "warn") : "plain") +
    (m.place ? chip(m.place, "plain") : "");
  const stats = [
    m.ordinal ? statCell(`${nf(m.ordinal)}.`, "Bugünkü kayıt") : null,
    m.total ? statCell(nf(m.total), "Toplam üye") : null,
    statCell(m.whenShort.split(" ").slice(-1)[0] || m.whenShort, "Kayıt saati"),
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="tr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>${escapeHtml(m.subject)}</title>
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${C.brandSoft}; }
  @media (max-width:520px) {
    .px { padding-left:16px !important; padding-right:16px !important; }
    .k { width:112px !important; }
    .name { font-size:21px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};">${escapeHtml(m.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page};">
<tr><td align="center" style="padding:24px 10px 34px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
    <tr><td style="padding:0 6px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" width="40"><img src="${LOGO}" width="32" height="32" alt="Descall" style="display:block;width:32px;height:32px;border:0;border-radius:9px;"></td>
        <td valign="middle" style="font-family:${FONT};font-size:16px;font-weight:700;color:${C.ink};">Descall <span style="font-weight:500;color:${C.muted};">· Ekip bildirimi</span></td>
      </tr></table>
    </td></tr>
    <tr><td bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.edge};border-radius:22px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td bgcolor="#1d2547" class="px" style="background-color:#1d2547;background-image:linear-gradient(135deg,#3a4fd0 0%,#2a3480 45%,#1a1f3a 100%);padding:24px 28px 22px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="background-color:rgba(255,255,255,0.12);border-radius:999px;padding:5px 11px;font-family:${FONT};font-size:11.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#dfe5ff;">Yeni üye</td>
          </tr></table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr>
            <td width="64" valign="middle">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td align="center" valign="middle" bgcolor="#6c86ff" style="background-color:#6c86ff;width:52px;height:52px;border-radius:16px;font-family:${FONT};font-size:24px;font-weight:750;color:#ffffff;">${escapeHtml(m.initial)}</td>
              </tr></table>
            </td>
            <td valign="middle" style="font-family:${FONT};">
              <p class="name" style="margin:0;font-size:24px;line-height:1.2;font-weight:750;letter-spacing:-0.01em;color:#ffffff;word-break:break-word;">${escapeHtml(m.displayName)}</p>
              <p style="margin:4px 0 0;font-size:14px;color:#c9d2ff;word-break:break-all;">${m.username ? `@${escapeHtml(m.username)}` : ""}${m.username && m.email ? " &middot; " : ""}${escapeHtml(m.email)}</p>
            </td>
          </tr></table>
          <div style="margin-top:16px;font-size:0;">${statusChips}</div>
        </td></tr>
        <tr><td class="px" style="padding:16px 28px 6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.inset}" style="background-color:${C.inset};border:1px solid ${C.edge};border-radius:14px;"><tr>${stats.join("")}</tr></table>
        </td></tr>
        <tr><td class="px" style="padding:14px 28px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${riskHead[1]}" style="background-color:${riskHead[1]};border:1px solid ${riskHead[2]};border-radius:14px;">
            <tr><td style="padding:14px 16px 10px;">
              <p style="margin:0 0 10px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${riskHead[3]};">Güvenlik sinyalleri &middot; ${escapeHtml(riskHead[0])}</p>
              <div style="font-size:0;">${m.signals.length ? m.signals.map((s) => chip(s.label, s.tone)).join("") : chip("Dikkat çeken bir şey yok", "ok")}</div>
            </td></tr>
          </table>
        </td></tr>
        ${m.sections.map(sectionBlock).join("")}
        <tr><td align="center" class="px" style="padding:12px 28px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;"><tr>
            <td align="center" bgcolor="${C.brand}" style="background-color:${C.brand};border-radius:12px;">
              <a href="${escapeHtml(m.adminHref)}" target="_blank" style="display:inline-block;padding:12px 20px;font-family:${FONT};font-size:14px;font-weight:650;color:#ffffff;text-decoration:none;">Yönetici Paneli'nde aç</a>
            </td></tr></table>
          <p style="margin:12px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.5;color:${C.muted};">Yönetici Paneli › Kişiler'de ${m.username ? `@${escapeHtml(m.username)}` : "hesabı"} ara: dosya, raporlar ve kullanıcının gözünden görünüm orada.</p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:20px 16px 0;">
      <p style="margin:0;font-family:${FONT};font-size:11.5px;line-height:1.6;color:${C.faint};">Bu e-posta yeni bir hesap açıldığında Descall ekibine otomatik gönderilir. Kullanıcı bunu görmez.<br>Yanıtla: ${escapeHtml(SUPPORT_EMAIL)} &middot; &copy; ${year} Descall</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function renderText(m) {
  const lines = [
    `Yeni üye: ${m.displayName}${m.username ? ` (@${m.username})` : ""}`,
    m.email || "E-posta yok",
    "",
  ];
  const summary = [m.ordinal ? `Bugünkü ${m.ordinal}. kayıt` : null, m.total ? `toplam ${m.total} üye` : null, m.whenShort]
    .filter(Boolean)
    .join(" · ");
  lines.push(summary, "");
  lines.push("GÜVENLİK SİNYALLERİ");
  if (m.signals.length) m.signals.forEach((s) => lines.push(`- ${s.label}`));
  else lines.push("- Dikkat çeken bir şey yok");
  for (const section of m.sections) {
    lines.push("", section.title.toLocaleUpperCase("tr"));
    for (const [k, v] of section.rows) lines.push(`${k}: ${displayValue(v, "—")}`);
  }
  lines.push("", `Yönetici Paneli: ${m.adminHref}`, "", "Bu e-posta Descall ekibine otomatik gönderilir.");
  return lines.join("\n");
}

function buildSignupReport(opts = {}) {
  const m = signupModel(opts);
  const year = new Date().getUTCFullYear();
  return { subject: m.subject, text: renderText(m), html: renderHtml(m, year), model: m };
}

/** Istanbul midnight as an ISO string (Türkiye is UTC+3 all year). */
function istanbulDayStartIso(now = new Date()) {
  const shifted = new Date(now.getTime() + 3 * 3600 * 1000);
  const day = shifted.toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00+03:00`).toISOString();
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms).unref?.())]);
}

/**
 * Best-effort numbers for the summary strip and the signals. Never throws;
 * anything slow or failing is left out.
 */
async function loadSignupContext({ userId, ip, visitorKey } = {}, { supabase, budgetMs = 2500 } = {}) {
  let db = supabase;
  if (!db) {
    try {
      db = require("../db/supabase");
    } catch {
      return {};
    }
  }
  const out = {};
  const count = async (query) => {
    try {
      const { count: c, error } = await query;
      return error ? null : c;
    } catch {
      return null;
    }
  };
  const tasks = [];
  const run = (fn) => {
    try {
      tasks.push(Promise.resolve(fn()).catch(() => null));
    } catch {
      /* best effort */
    }
  };
  run(() =>
    count(db.from("users").select("id", { count: "exact", head: true }).gte("created_at", istanbulDayStartIso())).then((c) => {
      if (Number.isFinite(c)) out.todayCount = c;
    })
  );
  run(() =>
    count(db.from("users").select("id", { count: "exact", head: true })).then((c) => {
      if (Number.isFinite(c)) out.totalUsers = c;
    })
  );
  if (ip) {
    run(
      (async () => {
        try {
          const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
          const { data, error } = await db.from("users").select("id, active_sessions").gte("created_at", since).limit(500);
          if (error || !Array.isArray(data)) return;
          out.sameIpCount = data.filter(
            (row) => row.id !== userId && Array.isArray(row.active_sessions) && row.active_sessions.some((s) => s && s.ip === ip)
          ).length;
        } catch {
          /* best effort */
        }
      })
    );
  }
  if (visitorKey) {
    run(() =>
      count(db.from("users").select("id", { count: "exact", head: true }).eq("signup_visitor_key", visitorKey).neq("id", userId)).then((c) => {
        if (Number.isFinite(c)) out.sameDeviceCount = c;
      })
    );
  }
  await withTimeout(Promise.all(tasks), budgetMs);
  return { ...out };
}

/**
 * Best-effort team notify. Never throws.
 * @returns {Promise<{ sent: boolean, providerId?: string|null, skipped?: boolean, error?: string }>}
 */
async function notifyTeamNewSignup(opts = {}) {
  try {
    const to = process.env.SIGNUP_NOTIFY_TO || "team@descall.com";
    const context =
      opts.context ||
      (await loadSignupContext({ userId: opts.user?.id, ip: clientIp(opts.req), visitorKey: opts.visitorKey }).catch(() => ({})));
    const { subject, text, html } = buildSignupReport({ ...opts, context });
    const result = await sendEmail({ to, subject, text, html, replyTo: SUPPORT_EMAIL });
    if (result?.providerId) console.log("[AUTH] signup team report sent", result.providerId);
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
  signupModel,
  loadSignupContext,
  istanbulDayStartIso,
  journeyLength,
  isDisposableDomain,
  sourceLabel,
  shortUa,
  istanbulStamp,
  formatStamp,
};
