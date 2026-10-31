"use strict";

/**
 * Descall transactional emails (3.7.8): one designed shell for every code email
 * (sign-up verification, sign-in code, email change, password reset). The words
 * come from the backend catalogs (backend/i18n/<locale>.js, email.*), Turkish
 * when no live language with a catalog matches. Table layout + inline styles so Gmail, Outlook,
 * Apple Mail and Yahoo render it the same; a hidden preheader for the inbox
 * preview; a plain-text twin for clients without HTML. No emoji (owner rule).
 */

const { resolveLang, parseAcceptLanguage, normalizeLocale } = require("./locales");
const { bt, availableLangs } = require("./i18n");
const { escapeHtml } = require("./emailUtil");

const SITE = "https://descall.com";
const SUPPORT = "support@descall.com";
const LOGO = `${SITE}/brand/descall-icon.png`;
const APP_STORE = "https://apps.apple.com/app/id6820558264";

const C = {
  page: "#0b0d12",
  card: "#12151d",
  edge: "#232937",
  ink: "#f4f6fb",
  body: "#c3c8d4",
  muted: "#8a91a3",
  faint: "#5d6475",
  brand: "#6c86ff",
  brandSoft: "#9db0ff",
  codeBg: "#0b0e16",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

/**
 * Email language: the account language when it is a live locale with a catalog
 * (backend/i18n/<id>.js), else the request's Accept-Language (best first), else Turkish.
 */
function langFrom(acceptLanguage, explicit) {
  return resolveLang([explicit, parseAcceptLanguage(acceptLanguage)], {
    available: availableLangs(),
    fallback: "tr",
  });
}

// Layout flags per purpose; the words live in backend/i18n/<locale>.js under email.*.
const LAYOUT = {
  email_verify_signup: { next: true },
  email_verify: {},
  "2fa_login": { warn: true, codeLabel: true },
  email_reauth: { warn: true, codeLabel: true },
  password_reset: { codeLabel: true },
};

/** Copy for one purpose in one language, rendered from the catalog. */
function copyFor(lang, purpose, { code, username, minutes }) {
  const k = (key) => `email.${purpose}.${key}`;
  const c = (key, vars) => bt(lang, `email.common.${key}`, vars);
  const flags = LAYOUT[purpose] || {};
  const P = {
    subject: bt(lang, k("subject"), { code }),
    eyebrow: bt(lang, k("eyebrow")),
    title: purpose === "email_verify_signup" && !username ? bt(lang, k("titleNoName")) : bt(lang, k("title"), { name: username }),
    intro: bt(lang, k("intro")),
    preheader: bt(lang, k("preheader"), { code, minutes }),
    ignore: bt(lang, k("ignore")),
    codeLabel: flags.codeLabel ? bt(lang, k("codeLabel")) : null,
    next: Boolean(flags.next),
    warn: Boolean(flags.warn),
  };
  const common = {
    hi: c("hi", { name: username }),
    codeLabel: c("codeLabel"),
    valid: c("valid", { minutes }),
    copyHint: c("copyHint"),
    never: c("never"),
    nextTitle: c("nextTitle"),
    steps: [1, 2, 3].map((i) => [c(`step${i}Title`), c(`step${i}Body`)]),
    getApp: c("getApp"),
    appWin: c("appWin"),
    appIos: c("appIos"),
    appWeb: c("appWeb"),
    help: c("help"),
    write: c("write"),
    privacy: c("privacy"),
    terms: c("terms"),
    why: c("why"),
    privacyHref: `${SITE}${c("privacyPath")}`,
    termsHref: `${SITE}${c("termsPath")}`,
    downloadHref: `${SITE}${c("downloadPath")}`,
    text: { code: c("textCode"), valid: c("textValid", { minutes }) },
  };
  return { P, common };
}

const PURPOSES = Object.freeze(["email_verify_signup", "email_verify", "2fa_login", "email_reauth", "password_reset"]);

function codeBlock(code, common, minutes, label) {
  // No space inside the code: a copied "603 167" would not paste into the 6 boxes.
  const spaced = escapeHtml(String(code));
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px;">
  <tr><td align="center" bgcolor="${C.codeBg}" style="background-color:${C.codeBg};border:1px solid ${C.edge};border-radius:16px;padding:22px 16px 18px;">
    <p style="margin:0 0 10px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};">${escapeHtml(label || common.codeLabel)}</p>
    <p style="margin:0;font-family:${MONO};font-size:40px;line-height:1.1;font-weight:700;letter-spacing:0.18em;color:${C.ink};-webkit-user-select:all;user-select:all;">${spaced}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0;">
      <tr><td bgcolor="#1b2340" style="background-color:#1b2340;border-radius:999px;padding:6px 12px;">
        <span style="font-family:${FONT};font-size:12.5px;font-weight:600;color:${C.brandSoft};">${escapeHtml(common.valid)}</span>
      </td></tr>
    </table>
  </td></tr>
</table>
<p style="margin:0;text-align:center;font-family:${FONT};font-size:12px;color:${C.faint};">${escapeHtml(common.copyHint)}</p>`;
}

function stepsBlock(common) {
  const rows = common.steps
    .map(
      ([title, body], i) => `
  <tr>
    <td width="40" valign="top" style="padding:0 0 14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="#1b2340" style="background-color:#1b2340;width:28px;height:28px;border-radius:999px;font-family:${FONT};font-size:13px;font-weight:700;color:${C.brandSoft};">${i + 1}</td>
      </tr></table>
    </td>
    <td valign="top" style="padding:3px 0 14px;">
      <p style="margin:0;font-family:${FONT};font-size:14.5px;font-weight:650;color:${C.ink};">${escapeHtml(title)}</p>
      <p style="margin:3px 0 0;font-family:${FONT};font-size:13.5px;line-height:1.5;color:${C.muted};">${escapeHtml(body)}</p>
    </td>
  </tr>`
    )
    .join("");
  return `
<tr><td style="padding:4px 32px 6px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${C.edge};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>
  <p style="margin:24px 0 16px;font-family:${FONT};font-size:16px;font-weight:700;color:${C.ink};">${escapeHtml(common.nextTitle)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
</td></tr>`;
}

function button(href, label, primary) {
  const bg = primary ? C.brand : "#1a1f2c";
  const fg = primary ? "#ffffff" : C.ink;
  const border = primary ? C.brand : C.edge;
  // inline-block tables wrap onto new lines on a narrow phone instead of
  // pushing the whole email sideways.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:4px;vertical-align:top;"><tr>
    <td align="center" bgcolor="${bg}" style="background-color:${bg};border:1px solid ${border};border-radius:12px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:11px 16px;font-family:${FONT};font-size:13.5px;font-weight:650;color:${fg};text-decoration:none;white-space:nowrap;">${escapeHtml(label)}</a>
    </td></tr></table>`;
}

function appsBlock(common) {
  return `
<tr><td align="center" style="padding:10px 24px 30px;">
  <p style="margin:0 0 12px;font-family:${FONT};font-size:13px;font-weight:600;color:${C.muted};">${escapeHtml(common.getApp)}</p>
  <div style="text-align:center;font-size:0;">
    ${button(common.downloadHref, common.appWin, true)}${button(APP_STORE, common.appIos, false)}${button(`${SITE}/app`, common.appWeb, false)}
  </div>
</td></tr>`;
}

/**
 * @param {{ purpose: string, code: string, username?: string, lang?: string, minutes?: number, year?: number }} p
 * @returns {{ subject: string, html: string, text: string }}
 */
function buildCodeEmail({ purpose, code, username = "", lang = "tr", minutes = 10, year = new Date().getUTCFullYear() }) {
  // A language without a catalog file (or a draft one) falls back to Turkish, as before.
  const id = normalizeLocale(lang, { liveOnly: true });
  const L = id && availableLangs().includes(id) ? id : "tr";
  const key = PURPOSES.includes(purpose) ? purpose : "email_verify";
  const user = String(username || "").trim().slice(0, 40);
  const { P, common } = copyFor(L, key, { code, username: user, minutes });
  const subject = P.subject;
  const title = P.title;
  const showHi = Boolean(user) && purpose !== "email_verify_signup";
  const preheader = P.preheader;
  const warnBg = P.warn ? "#2a1d14" : C.codeBg;
  const warnEdge = P.warn ? "#5a3b22" : C.edge;
  const warnInk = P.warn ? "#f3c99b" : C.muted;

  const html = `<!DOCTYPE html>
<html lang="${L}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>${escapeHtml(subject)}</title>
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${C.brandSoft}; }
  @media (max-width:520px) {
    .px { padding-left:20px !important; padding-right:20px !important; }
    .h1 { font-size:24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};">${escapeHtml(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page};">
<tr><td align="center" style="padding:28px 12px 36px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">
    <tr><td style="padding:0 6px 18px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle"><img src="${LOGO}" width="36" height="36" alt="Descall" style="display:block;width:36px;height:36px;border:0;border-radius:10px;"></td>
        <td valign="middle" style="padding-left:10px;font-family:${FONT};font-size:18px;font-weight:700;letter-spacing:-0.01em;color:${C.ink};">Descall</td>
      </tr></table>
    </td></tr>
    <tr><td bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.edge};border-radius:22px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td bgcolor="#1d2547" class="px" style="background-color:#1d2547;background-image:linear-gradient(135deg,#3a4fd0 0%,#2a3480 45%,#1a1f3a 100%);padding:30px 32px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td bgcolor="#2b3670" style="background-color:rgba(255,255,255,0.12);border-radius:999px;padding:5px 11px;font-family:${FONT};font-size:11.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#dfe5ff;">${escapeHtml(P.eyebrow)}</td>
          </tr></table>
          <h1 class="h1" style="margin:16px 0 0;font-family:${FONT};font-size:27px;line-height:1.25;font-weight:750;letter-spacing:-0.015em;color:#ffffff;">${escapeHtml(title)}</h1>
        </td></tr>
        <tr><td class="px" style="padding:26px 32px 8px;">
          ${showHi ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:15px;color:${C.ink};">${escapeHtml(common.hi)}</p>` : ""}
          <p style="margin:0;font-family:${FONT};font-size:15.5px;line-height:1.6;color:${C.body};">${escapeHtml(P.intro)}</p>
          ${codeBlock(code, common, minutes, P.codeLabel)}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 22px;">
            <tr><td bgcolor="${warnBg}" style="background-color:${warnBg};border:1px solid ${warnEdge};border-radius:14px;padding:14px 16px;">
              <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.55;color:${warnInk};">${escapeHtml(P.ignore)}</p>
              <p style="margin:8px 0 0;font-family:${FONT};font-size:13px;line-height:1.55;font-weight:600;color:${P.warn ? "#f3c99b" : C.body};">${escapeHtml(common.never)}</p>
            </td></tr>
          </table>
        </td></tr>
        ${P.next ? stepsBlock(common) : ""}
        ${P.next ? appsBlock(common) : ""}
      </table>
    </td></tr>
    <tr><td align="center" style="padding:22px 16px 0;">
      <p style="margin:0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${C.muted};">${escapeHtml(common.help)} ${escapeHtml(common.write)} <a href="mailto:${SUPPORT}" style="color:${C.brandSoft};text-decoration:none;">${SUPPORT}</a></p>
      <p style="margin:10px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.faint};">
        <a href="${common.privacyHref}" style="color:${C.muted};text-decoration:underline;">${escapeHtml(common.privacy)}</a>
        &nbsp;·&nbsp;
        <a href="${common.termsHref}" style="color:${C.muted};text-decoration:underline;">${escapeHtml(common.terms)}</a>
        &nbsp;·&nbsp;
        <a href="${SITE}" style="color:${C.muted};text-decoration:underline;">descall.com</a>
      </p>
      <p style="margin:10px 0 0;font-family:${FONT};font-size:11.5px;line-height:1.6;color:${C.faint};">${escapeHtml(common.why)}<br>&copy; ${year} Descall</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const lines = [
    title,
    "",
    showHi ? common.hi : null,
    P.intro,
    "",
    `${common.text.code}: ${code}`,
    common.text.valid,
    "",
    P.ignore,
    common.never,
  ];
  if (P.next) {
    lines.push("", common.nextTitle);
    common.steps.forEach(([t, b], i) => lines.push(`${i + 1}. ${t}: ${b}`));
    lines.push("", `${common.appWin}: ${common.downloadHref}`, `${common.appIos}: ${APP_STORE}`, `${common.appWeb}: ${SITE}/app`);
  }
  lines.push("", `${common.help} ${SUPPORT}`, `${common.privacy}: ${common.privacyHref}`, `${common.terms}: ${common.termsHref}`);
  const text = lines.filter((l) => l !== null).join("\n");
  return { subject, html, text };
}

module.exports = { buildCodeEmail, langFrom, PURPOSES };
