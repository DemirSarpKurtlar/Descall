"use strict";

/**
 * Passkey security e-mails with the "Ben degildim" / "Bendim" buttons (draft A, Guvenlik
 * e-postasi). Same dark card as the code e-mails (lib/emailTemplates.js), table layout and
 * inline styles. Both buttons only open https://descall.com/passkey/report#t=<token>; the
 * page asks once more before anything happens, so a link scanner that opens every URL
 * changes nothing. The token is in the URL fragment, never sent to a server in a URL.
 *
 * kinds: "added" (a passkey was added), "newPlace" (a passkey signed in from a place it never
 * used), "revoked" (someone answered "not me": the passkey and the sessions were ended).
 */

const { bt } = require("../i18n");
const { escapeHtml } = require("../emailUtil");

const C = {
  page: "#0b0d12",
  card: "#12151d",
  edge: "#232937",
  ink: "#f4f6fb",
  body: "#c3c8d4",
  muted: "#8a91a3",
  faint: "#5d6475",
  brand: "#6c86ff",
  danger: "#da373c",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const SITE = "https://descall.com";
const SUPPORT = "support@descall.com";
const BRAND = "Descall";

function countryName(lang, code) {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([lang, "en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

/** "Istanbul, Turkiye" / "Turkiye" / the catalog's "an unknown place". */
function placeText(lang, { city, country } = {}) {
  const c = countryName(lang, country);
  if (city && c) return `${city}, ${c}`;
  return c || city || bt(lang, "security.pk.unknownPlace");
}

function whenText(lang, atIso, timeZone) {
  const d = new Date(atIso || Date.now());
  const tz = timeZone || "UTC";
  try {
    const s = new Intl.DateTimeFormat(lang, { dateStyle: "long", timeStyle: "short", timeZone: tz }).format(d);
    return tz === "UTC" ? `${s} UTC` : s;
  } catch {
    return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  }
}

function button(href, label, bg, fg) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:4px;vertical-align:top;"><tr>
    <td align="center" bgcolor="${bg}" style="background-color:${bg};border-radius:12px;">
      <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:700;color:${fg};text-decoration:none;white-space:nowrap;">${escapeHtml(label)}</a>
    </td></tr></table>`;
}

/**
 * @param {object} p
 * @param {"added"|"newPlace"|"revoked"} p.kind
 * @param {string} p.lang  catalog language (langFrom of the request)
 * @param {string} p.name  passkey name
 * @param {string} [p.provider] "Windows Hello", "iCloud Keychain", ...
 * @param {string} [p.at]  ISO time of the event
 * @param {object} [p.place] { country, city }
 * @param {string} [p.timeZone] IANA zone of the request (CDN header), else UTC
 * @param {string} [p.token] one-time report token (added, newPlace)
 * @param {string} [p.base] site origin, https://descall.com
 * @returns {{ subject: string, html: string, text: string }}
 */
function buildPasskeySecurityEmail({ kind, lang = "tr", name = "Passkey", provider = "", at, place, timeZone, token, base = SITE, sessions = 0 }) {
  const k = (key, vars) => bt(lang, `security.pk.${key}`, vars);
  const vars = {
    name: String(name).slice(0, 64),
    provider: provider ? ` (${provider})` : "",
    when: whenText(lang, at, timeZone),
    place: placeText(lang, place),
    sessions,
  };
  const subject = k(`${kind}Subject`, vars);
  const title = k(`${kind}Title`, vars);
  const body = k(`${kind}Body`, vars);
  const link = token ? `${base}/passkey/report#t=${token}` : "";
  const actions = link
    ? `<div style="text-align:left;font-size:0;margin:22px 0 6px;">${button(`${link}&a=revoke`, k("notMe"), C.danger, "#ffffff")}${button(`${link}&a=confirm`, k("itWasMe"), "#e7e9f1", "#1d1f27")}</div>
       <p style="margin:8px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.55;color:${C.muted};">${escapeHtml(k("linkNote"))}</p>`
    : `<div style="text-align:left;font-size:0;margin:22px 0 6px;">${button(`${base}/login`, k("changePassword"), C.brand, "#ffffff")}</div>`;

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${C.page};">${escapeHtml(body)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page};">
<tr><td align="center" style="padding:28px 12px 36px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
    <tr><td style="padding:0 6px 18px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle"><img src="${SITE}/brand/descall-icon.png" width="36" height="36" alt="${BRAND}" style="display:block;width:36px;height:36px;border:0;border-radius:10px;"></td>
        <td valign="middle" style="padding-left:10px;font-family:${FONT};font-size:18px;font-weight:700;color:${C.ink};">${BRAND}</td>
      </tr></table>
    </td></tr>
    <tr><td bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.edge};border-radius:22px;padding:28px 30px 26px;">
      <p style="margin:0;font-family:${FONT};font-size:11.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${kind === "revoked" ? "#ff9a9a" : "#9db0ff"};">${escapeHtml(k("eyebrow"))}</p>
      <h1 style="margin:12px 0 0;font-family:${FONT};font-size:23px;line-height:1.3;font-weight:750;color:${C.ink};">${escapeHtml(title)}</h1>
      <p style="margin:12px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.body};">${escapeHtml(body)}</p>
      ${actions}
    </td></tr>
    <tr><td align="center" style="padding:20px 16px 0;">
      <p style="margin:0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${C.muted};">${escapeHtml(k("help"))} <a href="mailto:${SUPPORT}" style="color:#9db0ff;text-decoration:none;">${SUPPORT}</a></p>
      <p style="margin:8px 0 0;font-family:${FONT};font-size:11.5px;color:${C.faint};">&copy; ${new Date().getUTCFullYear()} Descall</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const lines = [title, "", body, ""];
  if (link) lines.push(`${k("notMe")}: ${link}&a=revoke`, `${k("itWasMe")}: ${link}&a=confirm`, "", k("linkNote"));
  else lines.push(`${k("changePassword")}: ${base}/login`);
  lines.push("", `${k("help")} ${SUPPORT}`);
  return { subject, html, text: lines.join("\n") };
}

module.exports = { buildPasskeySecurityEmail, placeText, whenText, countryName };
