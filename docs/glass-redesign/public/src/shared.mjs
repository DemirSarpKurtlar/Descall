// Shared chrome for the public site mockups (header capsule, footer, helpers).
import { I as BASE, L } from "../../desktop/src/icons.mjs";
import fs from "fs";
const EXTRA = { download: "download", layers: "layers", scroll: "scroll-text", gamepad: "gamepad-2", servers: "server", chat: "message-square", menu: "menu" };
export const I = new Proxy({}, { get: (_, k) => { try { return BASE[k]; } catch { return L(EXTRA[k] || String(k)); } } });
export { L };
export const legal = JSON.parse(fs.readFileSync(new URL("../data/legal.json", import.meta.url)));
export const seo = JSON.parse(fs.readFileSync(new URL("../data/seo.json", import.meta.url)));

/** Brand rule: no VALORANT / Riot mentions → drop sentences naming Riot, neutralise "Valorant". */
export function clean(s = "") {
  s = String(s);
  s = s.split(/(?<=[.!?])\s+/).filter((x) => !/riot/i.test(x)).join(" ");
  s = s.replace(/Valorant partileri/g, "oyun partileri").replace(/Gaming \/ Valorant/g, "Gaming").replace(/Valorant LFG/g, "LFG").replace(/Valorant \/ party finder/g, "LFG / party finder")
    .replace(/,\s*Valorant(?=,)/g, "").replace(/Valorant,\s*/g, "").replace(/\s*\+\s*Riot link/g, "").replace(/\bValorant\b\s*/g, "");
  return s.replace(/\s{2,}/g, " ").replace(/\s+([,.)])/g, "$1");
}
export const LOGO = "../../assets/brand/descall-icon.png";
export const LOCKUP = "../../assets/brand/descall-lockup.svg";
export const GH = `<svg class="i" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.8c.85 0 1.71.12 2.51.35 1.9-1.33 2.74-1.05 2.74-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .26.18.58.69.48A10.03 10.03 0 0 0 22 12.26C22 6.58 17.52 2 12 2z"/></svg>`;
export const GOOGLE = `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"/></svg>`;
const APPLE = `<svg viewBox="0 0 24 24" fill="#fff"><path d="M16.37 1.43c0 1.14-.49 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.21-2.98.8-.94 2.14-1.64 3.25-1.68.03.13.05.28.05.43zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8C4.97 18.38 3.93 15.57 3.93 12.92c0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.68.95 3.6.95.87 0 2.22-1.01 3.9-1.01.61 0 2.89.06 4.37 2.19-.13.09-2.38 1.37-2.38 4.19 0 3.26 2.85 4.42 2.96 4.45z"/></svg>`;
/** Apple "Download on the App Store" badge (black). Link target = App Store URL once the listing is public. */
export const appStore = () => `<a class="asb" title="Download on the App Store">${APPLE}<div><small>Download on the</small><strong>App Store</strong></div></a>`;

export function header(active = "") {
  const nav = [["/features", "Features"], ["/download", "Download"], ["/faq", "FAQ"]];
  return `<header class="hdr"><div class="hdr-bar glass">
    <a class="brand"><img class="brand-lockup" src="${LOCKUP}" alt="Descall"/><span class="beta" title="Descall is an independent beta product.">Beta</span></a>
    <nav class="navseg glass-chip">${nav.map(([to, l]) => `<a class="${active === to ? "lens" : ""}">${l}</a>`).join("")}</nav>
    <span class="sp"></span>
    <div class="lang glass-chip desk" title="Language"><span>TR</span><span class="lens">EN</span></div>
    <a class="b ghost desk">Sign In</a>
    <a class="b tint-brand desk">Start free</a>
    <a class="b soft desk">${I.download}Download</a>
    <a class="b sm tint-brand only-m">Start free</a>
    <a class="menu-btn glass-chip" title="Open menu">${L("menu")}</a>
  </div></header>`;
}

export function footer({ tr = false } = {}) {
  const T = (en, trs) => (tr ? trs : en);
  return `<footer class="foot2"><div class="foot-panel glass panel">
    <div class="foot-top">
      <div class="foot-brand">
        <a class="brand"><img class="brand-lockup" src="${LOCKUP}" alt="Descall"/><span class="beta">Beta</span></a>
        <p>Demir Sarp Kurtlar · Türkiye</p>
        <div class="wl"><b>${T("Product updates", "Ürün güncellemeleri")}</b><p>${T("Get occasional release notes — no spam, unsubscribe anytime.", "Ara sıra sürüm notları — spam yok, istediğin zaman çık.")}</p>
          <div class="wl-row glass-chip"><span class="ph">you@example.com</span><span class="b tint-brand sm">${T("Notify me", "Haber ver")}</span></div></div>
      </div>
      <div class="foot-cols">
        <section><h4>${T("Product", "Ürün")}</h4><a>${T("Features", "Özellikler")}</a><a>${T("Download", "İndir")}</a><a>${T("FAQ", "SSS")}</a></section>
        <section><h4>${T("Explore", "Keşfet")}</h4><a>${T("Discord alternative", "Discord alternatifi")}</a><a>LFG</a><a>${T("vs Discord", "Discord ile karşılaştır")}</a><a>${T("Turkey", "Türkiye")}</a><a>Blog</a><a>${T("Status", "Durum")}</a><a>${T("Sitemap", "Site haritası")}</a></section>
        <section><h4>${T("Company", "Şirket")}</h4><a>${T("About", "Hakkında")}</a><a>${T("Who owns Descall?", "Descall’ın sahibi kim?")}</a><a>${T("Security", "Güvenlik")}</a><a>${T("Contact", "İletişim")}</a><a>${T("Privacy Policy", "Gizlilik Politikası")}</a><a>${T("Terms", "Şartlar")}</a><a>${T("Copyright", "Telif hakkı")}</a><a>GitHub</a></section>
      </div>
    </div>
    <div class="foot-bot">
      <div class="lang glass-chip"><span class="${tr ? "lens" : ""}">TR</span><span class="${tr ? "" : "lens"}">EN</span></div>
      <div class="trust"><span class="tc">${L("circle-dot")}${T("Status", "Durum")}: Beta</span><span class="tc">${I.lock}${T("Transport security", "Aktarım güvenliği")}: TLS / DTLS-SRTP</span><span class="tc" style="color:var(--brand-hi)">${T("Live status", "Canlı durum")}</span><span class="tc" style="color:var(--brand-hi)">${T("Security details", "Güvenlik ayrıntıları")}</span></div>
      <span class="sp"></span><a class="inl">contact@descall.com</a>
    </div>
    <p class="foot-copy"><b>© 2026 Demir Sarp Kurtlar.</b> ${T("Descall is owned by Demir Sarp Kurtlar. All rights reserved. Last updated: August 25, 2026.", "Descall’ın sahibi Demir Sarp Kurtlar’dır. Tüm hakları saklıdır. Son güncelleme: 25 Ağustos 2026.")}</p>
  </div></footer>`;
}

/** Full page. overlay → modal/sheet frame rendered viewport-only (vp-fixed). */
export function page(body, { active = "", overlay = "", chrome = true, lang = "en", tr = false, vpFixed = false } = {}) {
  return `<!DOCTYPE html><html lang="${lang}" class="${vpFixed ? "vp-fixed" : ""}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="../public.css"/></head>
<body><div class="site"><div class="site-bg"></div><div class="site-grid"></div>
${chrome ? header(active) : ""}
<main class="wrap">${body}</main>
${chrome ? footer({ tr }) : ""}
</div>${overlay}</body></html>`;
}

export const tile = (ic, color, title, desc, more = "") => `<article class="tile2 glass"><div class="ico ${color}">${typeof ic === "string" && ic.startsWith("<") ? ic : I[ic] ?? L(ic)}</div><h3>${clean(title)}</h3><p>${clean(desc)}</p>${more ? `<span class="more">${more}${I.chevR}</span>` : ""}</article>`;
export const checks = (items) => `<ul class="checks">${items.map((x) => `<li><span class="ck">${I.check}</span><span>${clean(x)}</span></li>`).join("")}</ul>`;
export const pills = (title, items) => `<section class="section tight"><div class="eyebrow" style="margin-bottom:14px">${title}</div><div class="pills">${items.map((x) => `<a class="pill">${clean(x)}${I.chevR}</a>`).join("")}</div></section>`;
export const crumbs = (items) => `<nav class="crumbs glass-chip">${items.map((x, i) => (i === items.length - 1 ? `<b>${x}</b>` : `${x}${I.chevR}`)).join("")}</nav>`;
export const faqList = (items, openIdx = 0) => `<div class="faq glass">${items.map((x, i) => `<div class="qa ${i === openIdx ? "open" : ""}"><div class="q"><span>${clean(x.q)}</span><span class="tg">${I.chevD}</span></div>${i === openIdx ? `<div class="a">${clean(x.a)}</div>` : ""}</div>`).join("")}</div>`;
export const device = (shot, caption = "", chips = "") => `<figure class="device-wrap"><div class="halo"></div><div class="device glass"><div class="scr"><img src="../../assets/shots/${shot}.webp" alt=""/></div></div>${chips}${caption ? `<figcaption>${clean(caption)}</figcaption>` : ""}</figure>`;
export const kicker = (html, plain = false) => `<div class="kicker glass-chip ${plain ? "kplain" : ""}">${html}</div>`;
export const dot = `<span class="dot"></span>`;
