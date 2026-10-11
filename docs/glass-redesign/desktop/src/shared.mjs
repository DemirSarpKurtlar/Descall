import { I, L } from "./icons.mjs";
export { I, L };

// Same demo cast + gradients as the approved iPhone set (final/src/shared.mjs).
export const AV = {
  ayse:   { i: "A", c: "linear-gradient(145deg,#ff7a7f,#e5484d)", name: "Ayşe Yılmaz", user: "ayse" },
  mert:   { i: "M", c: "linear-gradient(145deg,#9b85ff,#6e4ff0)", name: "Mert K.", user: "mertk" },
  zeynep: { i: "Z", c: "linear-gradient(145deg,#ff8fc1,#e0508f)", name: "Zeynep", user: "zeynep" },
  can:    { i: "C", c: "linear-gradient(145deg,#5ee08a,#22a855)", name: "Can Demir", user: "candemir" },
  elif:   { i: "E", c: "linear-gradient(145deg,#ffc15a,#f08c00)", name: "Elif", user: "elif" },
  burak:  { i: "B", c: "linear-gradient(145deg,#6fd3ff,#2a9fd8)", name: "Burak Ö.", user: "burako" },
  selin:  { i: "S", c: "linear-gradient(145deg,#4fe0d2,#14a89a)", name: "Selin A.", user: "selin" },
  kaan:   { i: "K", c: "linear-gradient(145deg,#c39bff,#9356e8)", name: "Kaan", user: "kaan" },
  deniz:  { i: "D", c: "linear-gradient(145deg,#ff9f6b,#e5653a)", name: "Deniz T.", user: "denizt" },
  ece:    { i: "E", c: "linear-gradient(145deg,#7fe3ff,#3d8bf0)", name: "Ece", user: "ece" },
  me:     { i: "D", c: "linear-gradient(145deg,#7d97ff,#4a68e8)", name: "Demir Sarp", user: "demir" },
};
export const GROUP_GRAD = "linear-gradient(145deg,#6c86ff,#8a5cf6)";
export const GROUP2_GRAD = "linear-gradient(145deg,#33c4a8,#2a7fd8)";
export const GROUP3_GRAD = "linear-gradient(145deg,#ff8a65,#d6457a)";
export const GROUP4_GRAD = "linear-gradient(145deg,#ffc94d,#e07b18)";

export function av(key, size = 40, status = null, extra = "", ring = "") {
  const a = AV[key];
  const st = status ? `<span class="st ${status === "online" ? "" : status}"></span>` : "";
  return `<div class="av ${extra}" style="--s:${size}px;background:${a.c};${ring ? `--ring:${ring}` : ""}">${a.i}${st}</div>`;
}
export function gav(label, grad, size = 40, extra = "sq") {
  return `<div class="av ${extra}" style="--s:${size}px;background:${grad};font-size:${Math.round(size * 0.34)}px">${label}</div>`;
}

const winCtl = `<div class="wctl">
  <span title="Küçült"><svg viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" stroke-width="1"/></svg></span>
  <span title="Büyüt"><svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg></span>
  <span class="close" title="Kapat"><svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1"/></svg></span>
</div>`;
export const titlebar = (ctx = "") => `<div class="titlebar"><div class="brand"><img src="../../assets/brand/descall-icon.png" alt=""/>Descall</div>${ctx ? `<span class="ctx">${ctx}</span>` : ""}${winCtl}</div>`;

/** Full Electron window. opts.web → no title bar (browser chrome supplied by the web frame). */
export function win(body, { web = false, narrow = false, ctx = "", bg = `<div class="ambient"></div>`, extraHead = "" } = {}) {
  return `<!DOCTYPE html><html lang="tr" class="${narrow ? "narrow" : ""}"><head><meta charset="utf-8"/>
<link rel="stylesheet" href="../desktop.css"/>${extraHead}</head>
<body><div class="win ${web ? "web" : ""} ${narrow ? "narrow" : ""}">${bg}
${web ? "" : titlebar(ctx)}
${body}
</div></body></html>`;
}

// NavigationRail — navConfig.buildMainNavItems order + tools + avatar.
export const NAV = [
  ["chat", "chat", "Sohbetler"], ["groups", "groups", "Gruplar"], ["servers", "servers", "Sunucular"], ["play", "play", "Oyna"],
  ["friends", "friends", "Arkadaşlar"], ["activity", "activity", "Aktivite"], ["calls", "calls", "Aramalar"],
];
export function rail(active, { badges = { chat: 3, groups: 5 }, hover = null, status = "online", narrow = false } = {}) {
  return `<nav class="rail glass panel" ${narrow ? 'style="width:64px"' : ""}>
    <div class="logo"><img src="../../assets/brand/descall-icon.png" alt="Descall"/></div>
    <div class="grp">${NAV.map(([id, ic, label]) => `
      <div class="rbtn ${id === active ? "on lens" : ""} ${id === hover ? "hov" : ""}" title="${label}">${I[ic]}${badges[id] ? `<span class="pip">${badges[id]}</span>` : ""}</div>`).join("")}
    </div>
    <div class="div"></div>
    <div class="grp">
      <div class="rbtn ${hover === "add" ? "hov" : ""}" title="Yeni Ekle">${I.plus}</div>
      <div class="rbtn ${active === "settings" ? "on lens" : ""}" title="Kullanıcı Ayarları">${I.settings}</div>
    </div>
    <div class="me glass-chip">${av("me", 38, status, "", "#22243a")}</div>
  </nav>`;
}
/** Tooltip anchored right of a rail button (index in NAV order; tools: 7=add, 8=settings). */
export function railTip(index, label, { top = null } = {}) {
  const y = top ?? (40 + 12 + 44 + 12 + index * 54 + 24 - 16);
  return `<div class="tip glass heavy" style="left:${8 + 72 + 10}px;top:${y}px">${label}</div>`;
}

export function bgroup(items, cls = "") {
  return `<div class="bgroup glass ${cls}">${items.map((it) => {
    const [icon, opts = {}] = Array.isArray(it) ? it : [it];
    return `<span class="${opts.on ? "on" : ""} ${opts.danger ? "danger" : ""}" title="${opts.t || ""}">${I[icon]}${opts.badge ? `<b class="nb ${opts.red ? "red" : ""}">${opts.badge}</b>` : ""}</span>`;
  }).join("")}</div>`;
}

// ServerSidebar header (Search · Announcements · Feedback · [Invite link] · Add) + search field.
export function sideHeader(title, { buttons = null, plus = true, search = "Ara", sub = "", toolsInSearch = false } = {}) {
  const btns = buttons ?? [["search", { t: "Ara" }], ["megaphone", { t: "Duyurular", badge: 2, red: true }], ["feedback", { t: "Geri Bildirim Gönder" }]];
  if (toolsInSearch) return `<div class="side-h"><h2>${title}${sub ? `<small>${sub}</small>` : ""}</h2>${plus ? `<div class="cbtn glass tint-brand" title="Ekle">${I.plus}</div>` : ""}</div>
  <div style="display:flex;gap:8px;align-items:center;margin:12px 12px 4px"><div class="search glass-chip" style="flex:1;margin:0;min-width:0">${I.search}<span>${search}</span></div>${bgroup(btns)}</div>`;
  return `<div class="side-h"><h2>${title}${sub ? `<small>${sub}</small>` : ""}</h2>${btns.length ? bgroup(btns) : ""}${plus ? `<div class="cbtn glass tint-brand" title="Ekle">${I.plus}</div>` : ""}</div>
  ${search ? `<div class="search glass-chip">${I.search}<span>${search}</span><kbd>Ctrl K</kbd></div>` : ""}`;
}

export function dmRow(k, st, preview, time, { badge = 0, pinned = false, muted = false, hot = false, sel = false, hov = false, typing = false, more = false, dim = false } = {}) {
  return `<div class="row ${sel ? "sel" : ""} ${hov ? "hov" : ""}">
    ${av(k, 40, st)}
    <div class="body" ${more ? 'style="padding-right:34px"' : ""}>
      <div class="top"><span class="t">${AV[k].name}${pinned ? L("pin") : ""}${muted ? I.bellOff : ""}</span>${more ? "" : `<span class="time ${hot ? "hot" : ""}">${time}</span>`}</div>
      <div class="bot"><span class="s ${typing ? "istyping" : ""} ${dim ? "dim" : ""}">${preview}</span>${badge && !more ? `<span class="badge ${muted ? "muted" : ""}">${badge}</span>` : ""}</div>
    </div>
    ${more ? `<span class="more glass-chip">${I.moreH}</span>` : ""}
  </div>`;
}
export function groupRow(label, grad, name, preview, time, { badge = 0, sel = false, hov = false, members = 0 } = {}) {
  return `<div class="row ${sel ? "sel" : ""} ${hov ? "hov" : ""}">
    ${gav(label, grad, 40)}
    <div class="body"><div class="top"><span class="t">${name}</span><span class="time">${time}</span></div>
      <div class="bot"><span class="s">${preview}</span>${badge ? `<span class="badge">${badge}</span>` : ""}</div></div>
  </div>`;
}

export function chead({ left, buttons }) {
  return `<div class="edge-top"></div><div class="chead">${left}<div class="sp"></div>${bgroup(buttons)}</div>`;
}
export function peerDm(k, sub = "Çevrimiçi", st = "online", dim = false) {
  return `<div class="peer glass">${av(k, 40, st, "", "#2a2c3d")}<div><div class="nm">${AV[k].name}</div><div class="sb ${dim ? "dim" : ""}">${sub}</div></div></div>`;
}
export const DM_BTNS = (pins = 1, active = null) => [["search", { t: "Ara", on: active === "search" }], ["pin", { t: "Sabitlenmiş mesajlar", badge: pins }], ["calls", { t: "Sesli Arama" }], ["video", { t: "Görüntülü Arama" }], ["ban", { t: "Engelle" }]];

export function composer({ text = "", placeholder = "Mesaj…", strip = "", open = null, editing = false } = {}) {
  return `<div class="edge-bot"></div>
  <div class="composer">${strip}
    <div class="crow"><div class="cbtn glass ${open === "attach" ? "open" : ""}" title="Ek Ekle">${open === "attach" ? I.x : I.plus}</div>
      <div class="field glass">${text ? `<span class="txt">${text}<span class="caret"></span></span>` : `<span class="ph">${placeholder}</span>`}
        <span class="in ${open === "emoji" ? "on" : ""}" title="Emoji">${I.smile}</span><span class="in" title="Sesli Mesaj">${I.mic}</span>
        <span class="send ${text ? "tint-brand" : ""}" style="${text ? "" : "color:var(--t4)"}" title="${editing ? "Kaydet" : "Mesaj Gönder"}">${editing ? I.check : I.send}</span></div>
    </div>
  </div>`;
}
export function replyStrip(name, text) {
  return `<div class="strip glass">${I.reply}<div class="m"><b>Yanıtlanıyor ${name}</b><span>${text}</span></div><span class="x" title="Yanıtı iptal et">${I.x}</span></div>`;
}
export function editStrip(text) {
  return `<div class="strip glass">${I.pencil}<div class="m"><b>Mesajı düzenle</b><span>${text}</span></div><span class="x" title="Düzenlemeyi iptal et">${I.x}</span></div>`;
}

export function group(key, time, bubbles, { own = false, status = null, tag = "", extraAfter = "", id = "" } = {}) {
  const a = AV[key];
  return `<div class="mg ${own ? "own" : ""}" ${id ? `id="${id}"` : ""}>
    <div class="mh">${av(key, 36, status)}<span class="who">${own ? "Demir" : a.name}${tag}</span><span class="when">${time}</span></div>
    ${bubbles.map((b, i) => (typeof b === "string" ? `<div class="bub ${i ? "cont" : ""}">${b}</div>` : `<div class="bub ${i ? "cont" : ""} ${b.cls || ""}" style="${b.style || ""}" ${b.id ? `id="${b.id}"` : ""}>${b.html}</div>${b.after || ""}`)).join("")}
    ${extraAfter}
  </div>`;
}
export const tick = (dbl = true) => `<div class="foot">${dbl ? I.checkCheck : I.check}</div>`;
export function reacts(list, add = false) { return `<div class="reacts">${list.map(([e, n, mine]) => `<span class="rc ${mine ? "mine" : ""}">${e}<b>${n}</b></span>`).join("")}${add ? `<span class="rc add" title="Tepki ekle">${L("smile-plus")}</span>` : ""}</div>`; }
export function wave(n = 34, played = 12, seed = 3) {
  let out = ""; let x = seed;
  for (let k = 0; k < n; k++) { x = (x * 9301 + 49297) % 233280; const h = 6 + Math.round((x / 233280) * 18 * (0.5 + 0.5 * Math.sin(k / 3))); out += `<i class="${k < played ? "p" : ""}" style="height:${Math.max(5, h)}px"></i>`; }
  return `<div class="wave">${out}</div>`;
}
export const typing = (k, text) => `<div class="typing">${av(k, 22)}<span class="dots"><i></i><i></i><i></i></span>${text}</div>`;

// Standard DM list used in several frames.
export function dmList({ sel = "ayse", hov = null, more = null } = {}) {
  const rows = [
    ["ayse", "online", "Tamam, 9’da Lobi’de 👋", "21:16", { badge: 2, pinned: true, hot: true }],
    ["mert", "online", "yazıyor…", "21:02", { typing: true }],
    ["zeynep", "idle", "Sen: Tamamdır, yarın akşam görüşürüz", "18:40", {}],
    ["can", "dnd", `${I.mic}Sesli mesaj · 0:14`, "Dün", {}],
    ["elif", "online", `${I.image}Görsel`, "Dün", { badge: 3, muted: true }],
    ["burak", "off", "gg wp 🔥", "Pzt", {}],
    ["selin", "off", "Sen: Link attım, bakarsın", "Paz", {}],
    ["kaan", "off", "Hafta sonu müsait misin?", "12 Eki", {}],
    ["deniz", "off", "Cevapsız sesli arama", "10 Eki", { dim: true }],
  ];
  return rows.map(([k, st, p, t, o]) => dmRow(k, st, p, t, { ...o, sel: k === sel && !o.typing ? true : (k === sel), hov: k === hov, more: k === more || k === hov })).join("");
}
