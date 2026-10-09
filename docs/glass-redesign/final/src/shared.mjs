import { I, L } from "./icons.mjs";
export { I, L };

// Mock people only — no production data. Single-letter initials like the real Avatar fallback.
export const AV = {
  ayse:   { i: "A", c: "linear-gradient(145deg,#ff7a7f,#e5484d)", name: "Ayşe Yılmaz", user: "ayse" },
  mert:   { i: "M", c: "linear-gradient(145deg,#9b85ff,#6e4ff0)", name: "Mert K.", user: "mertk" },
  zeynep: { i: "Z", c: "linear-gradient(145deg,#ff8fc1,#e0508f)", name: "Zeynep", user: "zeynep" },
  can:    { i: "C", c: "linear-gradient(145deg,#5ee08a,#22a855)", name: "Can Demir", user: "candemir" },
  elif:   { i: "E", c: "linear-gradient(145deg,#ffc15a,#f08c00)", name: "Elif", user: "elif" },
  burak:  { i: "B", c: "linear-gradient(145deg,#6fd3ff,#2a9fd8)", name: "Burak Ö.", user: "burako" },
  selin:  { i: "S", c: "linear-gradient(145deg,#4fe0d2,#14a89a)", name: "Selin A.", user: "selin" },
  kaan:   { i: "K", c: "linear-gradient(145deg,#c39bff,#9356e8)", name: "Kaan", user: "kaan" },
  me:     { i: "D", c: "linear-gradient(145deg,#7d97ff,#4a68e8)", name: "Demir Sarp", user: "demir" },
};

export function av(key, size = 48, status = null, extra = "") {
  const a = AV[key];
  const st = status ? `<span class="st ${status === "online" ? "" : status}"></span>` : "";
  return `<div class="av ${extra}" style="--s:${size}px;background:${a.c}">${a.i}${st}</div>`;
}
export function gav(label, grad, size = 48, extra = "sq") {
  return `<div class="av ${extra}" style="--s:${size}px;background:${grad};font-size:${Math.round(size * 0.34)}px">${label}</div>`;
}
export const GROUP_GRAD = "linear-gradient(145deg,#6c86ff,#8a5cf6)";
export const GROUP2_GRAD = "linear-gradient(145deg,#33c4a8,#2a7fd8)";

const trays = `<div class="trays">
  <svg width="19" height="12" viewBox="0 0 19 12" fill="#fff"><rect x="0" y="7.5" width="3.2" height="4.5" rx="0.8"/><rect x="5" y="5" width="3.2" height="7" rx="0.8"/><rect x="10" y="2.5" width="3.2" height="9.5" rx="0.8"/><rect x="15" y="0" width="3.2" height="12" rx="0.8"/></svg>
  <svg width="17" height="12" viewBox="0 0 17 12" fill="#fff"><path d="M8.5 2.3c2.4 0 4.6.9 6.2 2.5l1.2-1.2A10.4 10.4 0 0 0 8.5.6 10.4 10.4 0 0 0 1.1 3.6l1.2 1.2A8.7 8.7 0 0 1 8.5 2.3Z"/><path d="M8.5 5.7c1.5 0 2.8.6 3.8 1.5l1.2-1.2a7 7 0 0 0-10 0l1.2 1.2c1-.9 2.3-1.5 3.8-1.5Z"/><path d="M8.5 9.1c.6 0 1.1.2 1.5.6L8.5 11.2 7 9.7c.4-.4.9-.6 1.5-.6Z"/></svg>
  <svg width="28" height="13" viewBox="0 0 28 13"><rect x="0.5" y="0.5" width="24" height="12" rx="3.6" fill="none" stroke="#fff" stroke-opacity="0.45"/><rect x="2" y="2" width="19" height="9" rx="2.2" fill="#fff"/><path d="M26 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="#fff" fill-opacity="0.45"/></svg>
</div>`;

export function phone(body, { bg = `<div class="ambient"></div>` } = {}) {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=440, height=956"/><link rel="stylesheet" href="../glass.css"/></head>
<body><div class="phone">${bg}
<div class="status-bar"><span>9:41</span><div class="island"></div>${trays}</div>
${body}
<div class="home-indicator"></div></div></body></html>`;
}

// Real 2.9.147 mobile navigation = NavigationRail main items (navConfig.js buildMainNavItems), in order.
export const TABS = [
  ["chat", "chat", "Sohbetler"], ["groups", "groups", "Gruplar"], ["servers", "servers", "Sunucular"],
  ["play", "play", "Oyna"], ["friends", "friends", "Arkadaşlar"], ["activity", "activity", "Aktivite"], ["calls", "calls", "Aramalar"],
];
export function tabBar(active, badges = {}) {
  return `<nav class="tabbar glass" id="tabbar">${TABS.map(([id, ic, label]) => `
    <div class="tab ${active && id === active ? "on lens" : ""}">${I[ic]}<span>${label}</span>${badges[id] ? `<span class="dotb">${badges[id]}</span>` : ""}</div>`).join("")}
  </nav>`;
}

// Rail avatar (status picker → settings) lives in the toolbar's leading slot.
export function meBtn(status = "online") {
  return `<div class="me-btn glass">${av("me", 38, status)}</div>`;
}
export function bgroup(items) {
  return `<div class="bgroup glass">${items.map((it) => {
    const [icon, opts = {}] = Array.isArray(it) ? it : [it];
    return `<span class="${opts.danger ? "danger" : ""}">${I[icon]}${opts.badge ? `<b class="nb">${opts.badge}</b>` : ""}</span>`;
  }).join("")}</div>`;
}
export function listHeader({ title, sub = "", buttons = [], plus = true, search = "Ara", status = "online" }) {
  return `
  <div class="edge-top" style="height:${search ? 236 : 184}px"></div>
  <div class="toolbar">${meBtn(status)}<div class="sp"></div>${bgroup(buttons)}${plus ? `<div class="cbtn glass tint-brand">${I.plus}</div>` : ""}</div>
  <h1 class="large-title">${title}${sub ? `<small>${sub}</small>` : ""}</h1>
  ${search ? `<div class="searchbar glass">${I.search}<span>${search}</span></div>` : ""}`;
}

export function convNav({ peerHtml, buttons }) {
  return `<div class="edge-top" style="height:150px"></div>
  <div class="conv-nav"><div class="cbtn glass">${I.back}</div><div class="peer glass">${peerHtml}</div>${bgroup(buttons)}</div>`;
}
export function composer({ text = "", placeholder = "Mesaj…" } = {}) {
  return `<div class="edge-bot" style="height:130px"></div>
  <div class="composer"><div class="cbtn glass">${I.plus}</div>
    <div class="field glass">${text ? `<span class="txt">${text}</span>` : `<span class="ph">${placeholder}</span>`}<span class="in">${I.smile}</span><span class="in">${I.mic}</span>
      <span class="send ${text ? "tint-brand" : ""}" style="${text ? "" : "color:var(--t4)"}">${I.send}</span></div>
  </div>`;
}

// Discord-style message group, matching MessageList.jsx: header (avatar 40 + status, author, timestamp) + bubbles.
export function group(key, time, bubbles, { own = false, status = null, tag = "", extraAfter = "" } = {}) {
  const a = AV[key];
  return `<div class="mg ${own ? "own" : ""}">
    <div class="mh">${av(key, 36, status)}<span class="who">${own ? "Demir" : a.name}${tag}</span><span class="when">${time}</span></div>
    ${bubbles.map((b, i) => (typeof b === "string" ? `<div class="bub ${i ? "cont" : ""}">${b}</div>` : `<div class="bub ${i ? "cont" : ""} ${b.cls || ""}" style="${b.style || ""}">${b.html}</div>${b.after || ""}`)).join("")}
    ${extraAfter}
  </div>`;
}
export const tick = (dbl = true) => `<div class="foot">${dbl ? I.checkCheck : I.check}</div>`;
export function reacts(list) { return `<div class="reacts">${list.map(([e, n, mine]) => `<span class="rc ${mine ? "mine" : ""}">${e}<b>${n}</b></span>`).join("")}</div>`; }
export function wave(n = 30, played = 11, seed = 3) {
  let out = ""; let x = seed;
  for (let k = 0; k < n; k++) { x = (x * 9301 + 49297) % 233280; const h = 6 + Math.round((x / 233280) * 18 * (0.5 + 0.5 * Math.sin(k / 3))); out += `<i class="${k < played ? "p" : ""}" style="height:${Math.max(5, h)}px"></i>`; }
  return `<div class="wave">${out}</div>`;
}
