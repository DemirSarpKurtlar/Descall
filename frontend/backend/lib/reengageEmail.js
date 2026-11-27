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

/* ---- growth 3B: people-first e-mails ------------------------------------ */

const PALETTE = ["#f05a5a", "#4b7bff", "#e0559b", "#2fbf71", "#9b5de5", "#f5a524", "#13a8c4", "#587af5"];

function initialOf(name) {
  const s = String(name || "?").trim();
  return escapeHtml((s[0] || "?").toLocaleUpperCase("tr"));
}

function colorOf(seed) {
  let h = 0;
  for (const ch of String(seed || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Round face: the photo when it is https, else a coloured letter (works without images). */
function face(person, size = 40) {
  const url = /^https:\/\//.test(String(person?.avatar || person?.avatarUrl || "")) ? person.avatar || person.avatarUrl : null;
  const bg = colorOf(person?.id || person?.name);
  if (url) {
    return `<img src="${escapeHtml(url)}" width="${size}" height="${size}" alt="${escapeHtml(person?.name || "")}" style="display:block;width:${size}px;height:${size}px;border-radius:999px;border:0;background-color:${bg};">`;
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" bgcolor="${bg}" style="background-color:${bg};width:${size}px;height:${size}px;border-radius:999px;font-family:${FONT};font-size:${Math.round(size * 0.42)}px;font-weight:700;color:#ffffff;">${initialOf(person?.name)}</td></tr></table>`;
}

function card(innerHtml) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;"><tr><td bgcolor="#161a24" style="background-color:#161a24;border:1px solid ${C.edge};border-radius:14px;padding:12px 14px;">${innerHtml}</td></tr></table>`;
}

function personRow(p) {
  return card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="48" valign="top">${face(p, 36)}</td>
    <td valign="top"><p style="margin:0;font-family:${FONT};font-size:14px;font-weight:700;color:${C.ink};">${escapeHtml(p.name)}</p>
    <p style="margin:3px 0 0;font-family:${FONT};font-size:13px;line-height:1.45;color:${C.muted};">${escapeHtml(p.line || "")}</p></td>
  </tr></table>`);
}

function actionRow(p, label, href) {
  return `<tr><td style="padding:10px 0;border-top:1px solid ${C.edge};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="42" valign="middle">${face(p, 30)}</td>
      <td valign="middle"><p style="margin:0;font-family:${FONT};font-size:14px;font-weight:650;color:${C.ink};">${escapeHtml(p.title)}</p>
      ${p.sub ? `<p style="margin:2px 0 0;font-family:${FONT};font-size:12.5px;color:${C.muted};">${escapeHtml(p.sub)}</p>` : ""}</td>
      <td align="right" valign="middle" style="white-space:nowrap;"><a href="${escapeHtml(href)}" style="font-family:${FONT};font-size:13px;font-weight:700;color:${C.brandSoft};text-decoration:none;">${escapeHtml(label)}</a></td>
    </tr></table></td></tr>`;
}

function sectionTitle(t) {
  return `<p style="margin:20px 0 6px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};">${escapeHtml(t)}</p>`;
}

function footerLinks({ unsubUrl, peopleUrl, freqUrl, lang }) {
  const c = require("./reengage/copy");
  const parts = [];
  if (peopleUrl) parts.push(`<a href="${escapeHtml(peopleUrl)}" style="color:${C.brandSoft};text-decoration:underline;">${escapeHtml(c.rt(lang, "mail.people"))}</a>`);
  if (freqUrl) parts.push(`<a href="${escapeHtml(freqUrl)}" style="color:${C.brandSoft};text-decoration:underline;">${escapeHtml(c.rt(lang, "mail.frequency"))}</a>`);
  if (unsubUrl) parts.push(`<a href="${escapeHtml(unsubUrl)}" style="color:${C.brandSoft};text-decoration:underline;">${escapeHtml(c.rt(lang, "mail.unsubscribe"))}</a>`);
  return parts.join(" &middot; ");
}

/**
 * Growth 3B e-mails in the same dark shell:
 *   kind "digest":    { people:[{id,name,avatar,line}], waiting:[{title,sub,cta,href,person}], streak:{peer,count,both},
 *                       range, counts:{people,mentions,waiting}, sameServers, subjectVars }
 *   kind "day14":     { name, faces:[...], server, count, gift, peer:{id,name,avatar}, peerHref }
 *   kind "campaign":  { subject, body, eyebrow } (console templates already rendered)
 * Always: lang, origin, unsubUrl, trackHref(path) -> click-tracked URL (optional).
 */
function buildPeopleEmail(p = {}) {
  const c = require("./reengage/copy");
  const lang = langOf(p.lang);
  const origin = String(p.origin || "https://descall.com").replace(/\/+$/, "");
  const track = typeof p.trackHref === "function" ? p.trackHref : (path) => `${origin}${path}`;
  const year = Number(p.year) || new Date().getUTCFullYear();
  const unsubUrl = p.unsubUrl || null;
  const prefsUrl = track("/settings/notifications");
  let subject;
  let preheader;
  let eyebrow;
  let title;
  let bodyHtml = "";
  let why;
  const text = [];

  if (p.kind === "digest") {
    const people = (p.people || []).slice(0, 4);
    const [a, b] = people;
    subject =
      p.subject ||
      (a && b
        ? c.rt(lang, "mail.digestSubjectTwo", { a: a.name, aLine: a.short || a.line, b: b.name, bLine: b.short || b.line })
        : a
          ? c.rt(lang, "mail.digestSubjectOne", { a: a.name, aLine: a.short || a.line })
          : c.rt(lang, "mail.digestSubjectNone"));
    eyebrow = c.rt(lang, "mail.digestEyebrow", { range: p.range || "" });
    title = c.rt(lang, "mail.digestTitle");
    const intro = p.sameServers ? c.rt(lang, "mail.digestIntroSame") : c.rt(lang, "mail.digestIntro", p.counts || { people: people.length, mentions: 0, waiting: 0 });
    preheader = intro;
    const grid = people.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${people
          .map((x, i) => (i % 2 === 0 ? `<tr><td width="50%" valign="top" style="padding-right:5px;">${personRow(x)}</td>` : `<td width="50%" valign="top" style="padding-left:5px;">${personRow(x)}</td></tr>`))
          .join("")}${people.length % 2 ? "<td></td></tr>" : ""}</table>`
      : "";
    const waiting = (p.waiting || []).slice(0, 3);
    const waitHtml = waiting.length
      ? `${sectionTitle(c.rt(lang, "mail.waitingTitle"))}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${waiting
          .map((w) => actionRow({ ...w.person, title: w.title, sub: w.sub }, w.cta, track(w.href)))
          .join("")}</table>`
      : "";
    const st = p.streak;
    const streakHtml = st
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;"><tr><td bgcolor="#2a2312" style="background-color:#2a2312;border:1px solid #5a4a1c;border-radius:14px;padding:12px 14px;font-family:${FONT};font-size:14px;color:#ffd877;"><b>${escapeHtml(c.rt(lang, "mail.streakLine", { peer: st.peer.name, count: st.count }))}</b> &middot; <span style="color:${C.body};">${escapeHtml(c.rt(lang, st.both ? "mail.streakBoth" : "mail.streakRisk"))}</span></td></tr></table>`
      : "";
    const peer = st?.peer || a || null;
    const ctas = `<div style="margin-top:20px;font-size:0;">${button(track("/app"), c.rt(lang, "mail.open"))}${peer?.id ? button(track(`/?dm=${encodeURIComponent(peer.id)}`), c.rt(lang, "mail.sayHi", { peer: peer.name }), false) : ""}</div>`;
    bodyHtml = `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.body};">${escapeHtml(intro)}</p>${grid}${waitHtml}${streakHtml}${ctas}`;
    why = c.rt(lang, "mail.digestWhy");
    text.push(title, "", intro, "");
    for (const x of people) text.push(`- ${x.name}: ${x.line}`);
    if (waiting.length) {
      text.push("", c.rt(lang, "mail.waitingTitle"));
      for (const w of waiting) text.push(`- ${w.title}${w.sub ? ` (${w.sub})` : ""}: ${track(w.href)}`);
    }
    if (st) text.push("", c.rt(lang, "mail.streakLine", { peer: st.peer.name, count: st.count }));
    text.push("", `${c.rt(lang, "mail.open")}: ${track("/app")}`);
  } else if (p.kind === "day14") {
    const faces = (p.faces || []).slice(0, 3);
    const names = faces.map((f) => f.name);
    subject = p.subject || (names.length && p.server ? c.rt(lang, "mail.day14Subject", { people: names.join(", "), server: p.server }) : c.rt(lang, "mail.day14SubjectNone"));
    eyebrow = c.rt(lang, "mail.day14Eyebrow");
    title = c.rt(lang, "mail.day14Title", { name: p.name || "" });
    preheader = p.body || (p.server ? c.rt(lang, "mail.day14Body", { server: p.server, count: p.count || 0 }) : title);
    const stack = faces.length
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr>${faces.map((f) => `<td style="padding-right:6px;">${face(f, 34)}</td>`).join("")}</tr></table>`
      : "";
    const intro = `<p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.body};">${escapeHtml(preheader)}</p>`;
    const gift = p.gift > 0
      ? `<td width="50%" valign="top" style="padding-right:5px;">${card(`<p style="margin:0;font-family:${FONT};font-size:14px;font-weight:700;color:#ffd877;">${escapeHtml(c.rt(lang, "mail.day14Gift", { amount: p.gift }))}</p><p style="margin:3px 0 0;font-family:${FONT};font-size:12.5px;color:${C.muted};">${escapeHtml(c.rt(lang, "mail.day14GiftSub"))}</p>`)}</td>`
      : "";
    const hi = p.peer?.id
      ? `<td width="50%" valign="top" style="padding-left:5px;">${card(`<p style="margin:0;font-family:${FONT};font-size:14px;font-weight:700;color:${C.ink};">${escapeHtml(c.rt(lang, "mail.day14Alt"))}</p><p style="margin:3px 0 0;font-family:${FONT};font-size:12.5px;color:${C.muted};">${escapeHtml(c.rt(lang, "mail.day14AltSub", { peer: p.peer.name }))}</p>`)}</td>`
      : "";
    const choices = gift || hi ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0;"><tr>${gift}${hi}</tr></table>` : "";
    const ctas = `<div style="margin-top:16px;font-size:0;">${button(track("/app"), c.rt(lang, "mail.comeBack"))}${p.peer?.id ? button(track(`/?dm=${encodeURIComponent(p.peer.id)}&hi=1`), c.rt(lang, "mail.sayHiWrite", { peer: p.peer.name }), false) : ""}</div>`;
    bodyHtml = `${stack}${intro}${choices}${ctas}<p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:1.55;color:${C.muted};">${escapeHtml(c.rt(lang, "mail.day14Last"))}</p>`;
    why = c.rt(lang, "mail.day14Why");
    text.push(title, "", preheader, "");
    if (p.gift > 0) text.push(`${c.rt(lang, "mail.day14Gift", { amount: p.gift })} - ${c.rt(lang, "mail.day14GiftSub")}`);
    if (p.peer?.id) text.push(`${c.rt(lang, "mail.day14Alt")}: ${track(`/?dm=${encodeURIComponent(p.peer.id)}&hi=1`)}`);
    text.push("", `${c.rt(lang, "mail.comeBack")}: ${track("/app")}`, "", c.rt(lang, "mail.day14Last"));
  } else {
    subject = String(p.subject || "Descall").slice(0, 160);
    eyebrow = p.eyebrow || c.rt(lang, "mail.inactiveEyebrow");
    title = subject;
    preheader = String(p.body || "").slice(0, 160);
    const faces = (p.faces || []).slice(0, 3);
    const stack = faces.length
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr>${faces.map((f) => `<td style="padding-right:6px;">${face(f, 34)}</td>`).join("")}</tr></table>`
      : "";
    bodyHtml = `${stack}<p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.body};">${escapeHtml(p.body || "")}</p><div style="margin-top:20px;font-size:0;">${button(track("/app"), c.rt(lang, "mail.open"))}</div>`;
    why = c.rt(lang, "mail.inactiveWhy");
    text.push(title, "", p.body || "", "", `${c.rt(lang, "mail.open")}: ${track("/app")}`);
  }

  const links = footerLinks({ unsubUrl, peopleUrl: p.kind === "digest" ? prefsUrl : null, freqUrl: p.kind === "digest" ? prefsUrl : null, lang });
  const html = shell({
    lang,
    subject,
    preheader,
    eyebrow,
    title,
    hi: "",
    bodyHtml,
    why,
    unsubUrl: null,
    unsubLabel: "",
    year,
  }).replace(
    `${escapeHtml(why)}</p>`,
    `${escapeHtml(why)}</p>${links ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;">${links}</p>` : ""}`
  );
  text.push("", why);
  if (unsubUrl) text.push(`${c.rt(lang, "mail.unsubscribe")}: ${unsubUrl}`);
  text.push("", SUPPORT);
  const headers = unsubUrl ? { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {};
  return { subject, html, text: text.join("\n"), headers, lang };
}

module.exports = { buildReengageEmail, buildPeopleEmail, KINDS };
