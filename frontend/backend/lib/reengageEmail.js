"use strict";

/**
 * Re-engagement emails (item 4): friend request / server invite fallback and the
 * day 3 / day 7 lifecycle mails. Same dark shell as lib/emailTemplates.js, words
 * from backend/i18n/<locale>.js (reengage.email.*) in the account language
 * (Turkish when none matches), a plain-text twin, and a one-click unsubscribe
 * link + RFC 8058 List-Unsubscribe headers in every mail. No emoji (owner rule).
 */

const { bt, pickLang } = require("./i18n");
const { escapeHtml } = require("./emailUtil");

const SUPPORT = "support@descall.com";
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

const KINDS = Object.freeze(["friendRequest", "serverInvite", "day3", "day7"]);

function langOf(lang) {
  return pickLang([lang], "tr");
}

function clip(value, max) {
  const s = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function button(href, label, primary = true) {
  const bg = primary ? C.brand : "#1a1f2c";
  const border = primary ? C.brand : C.edge;
  const fg = primary ? "#ffffff" : C.ink;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:4px 8px 4px 0;vertical-align:top;"><tr>
    <td align="center" bgcolor="${bg}" style="background-color:${bg};border:1px solid ${border};border-radius:12px;">
      <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:11px 18px;font-family:${FONT};font-size:14px;font-weight:650;color:${fg};text-decoration:none;white-space:nowrap;">${escapeHtml(label)}</a>
    </td></tr></table>`;
}

function tipBlock(n, title, body, extraHtml) {
  return `
<tr>
  <td width="40" valign="top" style="padding:0 0 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" bgcolor="#1b2340" style="background-color:#1b2340;width:28px;height:28px;border-radius:999px;font-family:${FONT};font-size:13px;font-weight:700;color:${C.brandSoft};">${n}</td>
    </tr></table>
  </td>
  <td valign="top" style="padding:3px 0 18px;">
    <p style="margin:0;font-family:${FONT};font-size:15px;font-weight:650;color:${C.ink};">${escapeHtml(title)}</p>
    <p style="margin:4px 0 0;font-family:${FONT};font-size:14px;line-height:1.55;color:${C.muted};">${escapeHtml(body)}</p>
    ${extraHtml || ""}
  </td>
</tr>`;
}

function shell({ lang, subject, preheader, eyebrow, title, hi, bodyHtml, why, unsubUrl, unsubLabel, year }) {
  return `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${escapeHtml(subject)}</title>
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${C.brandSoft}; }
  @media (max-width:520px) { .px { padding-left:20px !important; padding-right:20px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};">${escapeHtml(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page};">
<tr><td align="center" style="padding:28px 12px 36px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">
    <tr><td style="padding:0 6px 18px;font-family:${FONT};font-size:18px;font-weight:700;color:${C.ink};">Descall</td></tr>
    <tr><td bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.edge};border-radius:22px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td bgcolor="#1d2547" class="px" style="background-color:#1d2547;background-image:linear-gradient(135deg,#3a4fd0 0%,#2a3480 45%,#1a1f3a 100%);padding:30px 32px 28px;">
          <p style="margin:0;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#dfe5ff;">${escapeHtml(eyebrow)}</p>
          <h1 style="margin:14px 0 0;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:750;color:#ffffff;">${escapeHtml(title)}</h1>
        </td></tr>
        <tr><td class="px" style="padding:26px 32px 26px;">
          ${hi ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:15px;color:${C.ink};">${escapeHtml(hi)}</p>` : ""}
          ${bodyHtml}
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:22px 16px 0;">
      <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};">${escapeHtml(why)}</p>
      ${unsubUrl ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;"><a href="${escapeHtml(unsubUrl)}" style="color:${C.brandSoft};text-decoration:underline;">${escapeHtml(unsubLabel)}</a></p>` : ""}
      <p style="margin:10px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.faint};"><a href="mailto:${SUPPORT}" style="color:${C.muted};text-decoration:none;">${SUPPORT}</a> &middot; &copy; ${year} Descall</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * @param {object} p
 *   kind: "friendRequest" | "serverInvite" | "day3" | "day7"
 *   lang, origin, username (recipient), from (sender name), server (server name),
 *   inviteCode (serverInvite), unsubUrl
 * @returns {{ subject, html, text, headers }}
 */
function buildReengageEmail(p = {}) {
  const kind = KINDS.includes(p.kind) ? p.kind : "friendRequest";
  const lang = langOf(p.lang);
  const origin = String(p.origin || "https://descall.com").replace(/\/+$/, "");
  const year = Number(p.year) || new Date().getUTCFullYear();
  const name = clip(p.username, 40);
  const from = clip(p.from, 48) || bt(lang, "push.someone");
  const server = clip(p.server, 60) || bt(lang, "push.ownerServerFallback");
  const e = (key, vars) => bt(lang, `reengage.email.${key}`, vars);
  const k = (key) => e(`${kind}.${key}`, { name: name || from, from, server });
  const lifecycle = kind === "day3" || kind === "day7";

  const subject = k("subject");
  const preheader = k("preheader");
  const title = k("title");
  const intro = k("intro");
  const hi = name ? e("hi", { name }) : "";
  const why = lifecycle ? e("whyLifecycle") : e("whyActivity");
  const unsubUrl = p.unsubUrl || null;
  const unsubLabel = e("unsubscribe");
  const intoP = `<p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.body};">${escapeHtml(intro)}</p>`;
  const textLines = [title, "", hi || null, intro, ""];
  let bodyHtml;

  if (lifecycle) {
    const inviteUrl = name ? `${origin}/register?ref=${encodeURIComponent(name)}` : `${origin}/register`;
    const serversUrl = `${origin}/servers`;
    const linkBox = `<p style="margin:10px 0 0;padding:10px 12px;background-color:${C.codeBg};border:1px solid ${C.edge};border-radius:10px;font-family:${MONO};font-size:13px;color:${C.ink};word-break:break-all;"><a href="${escapeHtml(inviteUrl)}" style="color:${C.ink};text-decoration:none;">${escapeHtml(inviteUrl)}</a></p>`;
    const tips = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px;">
      ${tipBlock(1, e("tipInviteTitle"), e("tipInviteBody"), linkBox)}
      ${tipBlock(2, e("tipServersTitle"), e("tipServersBody"), `<div style="margin-top:10px;font-size:0;">${button(serversUrl, e("tipServersCta"), false)}</div>`)}
    </table>`;
    const last = kind === "day7" ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:13px;line-height:1.55;color:${C.muted};">${escapeHtml(e("day7.last"))}</p>` : "";
    bodyHtml = `${intoP}${tips}<div style="margin-top:6px;font-size:0;">${button(`${origin}/app`, e("openApp"))}</div>${last}`;
    textLines.push(
      `1. ${e("tipInviteTitle")}: ${e("tipInviteBody")}`,
      `   ${inviteUrl}`,
      `2. ${e("tipServersTitle")}: ${e("tipServersBody")}`,
      `   ${serversUrl}`,
      "",
      `${e("openApp")}: ${origin}/app`
    );
    if (kind === "day7") textLines.push("", e("day7.last"));
  } else {
    const code = String(p.inviteCode || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
    const href = kind === "serverInvite" && code ? `${origin}/servers/join/${encodeURIComponent(code)}` : `${origin}/friends`;
    bodyHtml = `${intoP}<div style="margin-top:22px;font-size:0;">${button(href, k("cta"))}</div>`;
    textLines.push(`${k("cta")}: ${href}`);
  }

  textLines.push("", why);
  if (unsubUrl) textLines.push(`${e("unsubscribeText")} ${unsubUrl}`);
  textLines.push("", SUPPORT);

  const html = shell({
    lang,
    subject,
    preheader,
    eyebrow: k("eyebrow"),
    title,
    hi,
    bodyHtml,
    why,
    unsubUrl,
    unsubLabel,
    year,
  });
  const headers = unsubUrl
    ? { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : {};
  return { subject, html, text: textLines.filter((l) => l !== null).join("\n"), headers, lang };
}

module.exports = { buildReengageEmail, KINDS };
