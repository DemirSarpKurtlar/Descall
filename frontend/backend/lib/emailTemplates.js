"use strict";

/**
 * Descall transactional emails (3.7.8): one designed shell for every code email
 * (sign-up verification, sign-in code, email change, password reset), Turkish
 * first with an English copy. Table layout + inline styles so Gmail, Outlook,
 * Apple Mail and Yahoo render it the same; a hidden preheader for the inbox
 * preview; a plain-text twin for clients without HTML. No emoji (owner rule).
 */

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

/** "tr" unless the request clearly prefers English. */
function langFrom(acceptLanguage, explicit) {
  const e = String(explicit || "").toLowerCase();
  if (e.startsWith("en")) return "en";
  if (e.startsWith("tr")) return "tr";
  const first = String(acceptLanguage || "").split(",")[0].trim().toLowerCase();
  return first.startsWith("en") ? "en" : "tr";
}

const COPY = {
  tr: {
    email_verify_signup: {
      subject: (c) => `${c} – Descall doğrulama kodun`,
      eyebrow: "E-posta doğrulama",
      title: (u) => (u ? `Descall'a hoş geldin, ${u}!` : "Descall'a hoş geldin!"),
      intro: "Hesabın hazır. Son bir adım kaldı: e-posta adresini doğrulamak için aşağıdaki kodu uygulamaya gir.",
      preheader: (c, m) => `Doğrulama kodun: ${c} · ${m} dakika geçerli`,
      next: true,
      ignore: "Bu hesabı sen oluşturmadıysan bu e-postayı yok sayabilirsin. Adres doğrulanmadıkça hiçbir hesaba bağlanmaz.",
    },
    email_verify: {
      subject: (c) => `${c} – Descall e-posta doğrulama kodun`,
      eyebrow: "E-posta doğrulama",
      title: () => "E-posta adresini doğrula",
      intro: "Descall hesabına bu e-posta adresini eklemek için aşağıdaki kodu uygulamaya gir.",
      preheader: (c, m) => `Doğrulama kodun: ${c} · ${m} dakika geçerli`,
      ignore: "Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin. Adresin hiçbir hesaba eklenmez.",
    },
    "2fa_login": {
      subject: (c) => `${c} – Descall giriş kodun`,
      eyebrow: "Giriş kodu",
      codeLabel: "Giriş kodun",
      title: () => "Girişini tamamla",
      intro: "Hesabına giriş yapmak için bu kodu Descall'a gir.",
      preheader: (c, m) => `Giriş kodun: ${c} · ${m} dakika geçerli`,
      ignore: "Giriş yapmaya çalışan sen değilsen şifren başkasının elinde olabilir. Hemen şifreni değiştir ve Ayarlar › Güvenlik'ten doğrulama uygulamasını aç.",
      warn: true,
    },
    email_reauth: {
      subject: (c) => `${c} – Descall onay kodun`,
      eyebrow: "Hesap güvenliği",
      codeLabel: "Onay kodun",
      title: () => "Bu sen misin?",
      intro: "Hesabındaki e-posta adresini değiştirmek için bu kodu gir.",
      preheader: (c, m) => `Onay kodun: ${c} · ${m} dakika geçerli`,
      ignore: "Bu değişikliği sen istemediysen kodu kimseyle paylaşma ve şifreni değiştir. Kod olmadan adres değiştirilemez.",
      warn: true,
    },
    password_reset: {
      subject: (c) => `${c} – Descall şifre sıfırlama kodun`,
      eyebrow: "Şifre sıfırlama",
      codeLabel: "Sıfırlama kodun",
      title: () => "Şifreni sıfırla",
      intro: "Yeni bir şifre belirlemek için bu kodu Descall'a gir.",
      preheader: (c, m) => `Şifre sıfırlama kodun: ${c} · ${m} dakika geçerli`,
      ignore: "Şifre sıfırlamayı sen istemediysen bu e-postayı yok sayabilirsin; şifren değişmez.",
    },
    common: {
      hi: (u) => `Merhaba ${u},`,
      codeLabel: "Doğrulama kodun",
      valid: (m) => `${m} dakika geçerli`,
      copyHint: "Kodu seçip kopyalayabilirsin.",
      never: "Descall ekibi kodunu hiçbir zaman istemez. Kimseyle paylaşma.",
      nextTitle: "Sırada ne var?",
      steps: [
        ["Arkadaşlarını ekle", "Kullanıcı adlarıyla bul ya da davet bağlantını paylaş."],
        ["Bir sunucuya katıl", "Topluluklara katıl ya da kendi sunucunu birkaç saniyede kur."],
        ["Konuşmaya başla", "Mesajlaş, sesli ve görüntülü ara, ekranını paylaş."],
      ],
      getApp: "Descall her yerde seninle",
      appWin: "Windows için indir",
      appIos: "App Store'dan indir",
      appWeb: "Tarayıcıda aç",
      help: "Yardıma mı ihtiyacın var?",
      write: "Bize yaz:",
      privacy: "Gizlilik",
      terms: "Kullanım Koşulları",
      why: "Bu e-postayı Descall hesabınla ilgili bir işlem yapıldığı için aldın.",
      privacyHref: `${SITE}/gizlilik`,
      termsHref: `${SITE}/kosullar`,
      downloadHref: `${SITE}/tr/download`,
      text: {
        code: "Kodun",
        valid: (m) => `${m} dakika geçerli.`,
      },
    },
  },
  en: {
    email_verify_signup: {
      subject: (c) => `${c} is your Descall verification code`,
      eyebrow: "Email verification",
      title: (u) => (u ? `Welcome to Descall, ${u}!` : "Welcome to Descall!"),
      intro: "Your account is ready. One last step: enter the code below in the app to verify your email address.",
      preheader: (c, m) => `Your code: ${c} · valid for ${m} minutes`,
      next: true,
      ignore: "If you didn't create this account, you can ignore this email. The address isn't linked to any account until it's verified.",
    },
    email_verify: {
      subject: (c) => `${c} is your Descall verification code`,
      eyebrow: "Email verification",
      title: () => "Verify your email address",
      intro: "Enter the code below in the app to add this email address to your Descall account.",
      preheader: (c, m) => `Your code: ${c} · valid for ${m} minutes`,
      ignore: "If you didn't request this, you can ignore this email. Your address won't be added to any account.",
    },
    "2fa_login": {
      subject: (c) => `${c} is your Descall sign-in code`,
      eyebrow: "Sign-in code",
      codeLabel: "Your sign-in code",
      title: () => "Finish signing in",
      intro: "Enter this code in Descall to sign in to your account.",
      preheader: (c, m) => `Your sign-in code: ${c} · valid for ${m} minutes`,
      ignore: "If this wasn't you, someone may know your password. Change it now and turn on the authenticator app in Settings › Security.",
      warn: true,
    },
    email_reauth: {
      subject: (c) => `${c} is your Descall confirmation code`,
      eyebrow: "Account security",
      codeLabel: "Your confirmation code",
      title: () => "Is this you?",
      intro: "Enter this code to change the email address on your account.",
      preheader: (c, m) => `Your confirmation code: ${c} · valid for ${m} minutes`,
      ignore: "If you didn't ask for this, don't share the code and change your password. The address can't change without it.",
      warn: true,
    },
    password_reset: {
      subject: (c) => `${c} is your Descall password reset code`,
      eyebrow: "Password reset",
      codeLabel: "Your reset code",
      title: () => "Reset your password",
      intro: "Enter this code in Descall to choose a new password.",
      preheader: (c, m) => `Your reset code: ${c} · valid for ${m} minutes`,
      ignore: "If you didn't ask to reset your password, you can ignore this email; your password stays the same.",
    },
    common: {
      hi: (u) => `Hi ${u},`,
      codeLabel: "Your code",
      valid: (m) => `Valid for ${m} minutes`,
      copyHint: "You can select and copy the code.",
      never: "Descall staff will never ask for your code. Don't share it with anyone.",
      nextTitle: "What's next?",
      steps: [
        ["Add your friends", "Find them by username or share your invite link."],
        ["Join a server", "Join a community or create your own in seconds."],
        ["Start talking", "Message, voice and video call, share your screen."],
      ],
      getApp: "Descall goes where you go",
      appWin: "Download for Windows",
      appIos: "Get it on the App Store",
      appWeb: "Open in browser",
      help: "Need help?",
      write: "Write to us:",
      privacy: "Privacy",
      terms: "Terms",
      why: "You received this email because of an action on your Descall account.",
      privacyHref: `${SITE}/privacy`,
      termsHref: `${SITE}/terms`,
      downloadHref: `${SITE}/download`,
      text: {
        code: "Your code",
        valid: (m) => `Valid for ${m} minutes.`,
      },
    },
  },
};

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
        <span style="font-family:${FONT};font-size:12.5px;font-weight:600;color:${C.brandSoft};">${escapeHtml(common.valid(minutes))}</span>
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
 * @param {{ purpose: string, code: string, username?: string, lang?: "tr"|"en", minutes?: number, year?: number }} p
 * @returns {{ subject: string, html: string, text: string }}
 */
function buildCodeEmail({ purpose, code, username = "", lang = "tr", minutes = 10, year = new Date().getUTCFullYear() }) {
  const L = COPY[lang === "en" ? "en" : "tr"];
  const P = L[PURPOSES.includes(purpose) ? purpose : "email_verify"];
  const common = L.common;
  const user = String(username || "").trim().slice(0, 40);
  const subject = P.subject(code);
  const title = P.title(user);
  const showHi = Boolean(user) && purpose !== "email_verify_signup";
  const preheader = P.preheader(code, minutes);
  const warnBg = P.warn ? "#2a1d14" : C.codeBg;
  const warnEdge = P.warn ? "#5a3b22" : C.edge;
  const warnInk = P.warn ? "#f3c99b" : C.muted;

  const html = `<!DOCTYPE html>
<html lang="${lang === "en" ? "en" : "tr"}" xmlns="http://www.w3.org/1999/xhtml">
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
          ${showHi ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:15px;color:${C.ink};">${escapeHtml(common.hi(user))}</p>` : ""}
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
    showHi ? common.hi(user) : null,
    P.intro,
    "",
    `${common.text.code}: ${code}`,
    common.text.valid(minutes),
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

module.exports = { buildCodeEmail, langFrom, PURPOSES, COPY };
