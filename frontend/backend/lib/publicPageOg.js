"use strict";

/**
 * 1200x630 link preview images (UI-BRIEF draft A, owner item 23): a big card over the
 * server banner with the icon, name, short description, online / member counts and the
 * Descall mark; a group card with member avatars; a neutral "invite no longer valid"
 * card that never names the server or group.
 *
 * Drawn with sharp: shapes as SVG (librsvg), text with the bundled Inter font files
 * (pango, assets/fonts, OFL), so the result does not depend on fonts installed on the
 * host. Remote icons / banners are fetched only from our own storage hosts, with a
 * timeout and a size cap; any failure falls back to the brand background / initial.
 *
 * Images are cached in memory (LRU) by kind + id + version; the URLs that point here are
 * versioned (?v=), so the HTTP response is immutable and the edge caches it for good.
 * Tests: publicPageOg.selftest.cjs.
 */

const path = require("path");
const sharp = require("sharp");

let copyMod = null;
function copy() {
  // public/server-page-copy.js is ESM ("type": "module" in frontend/package.json);
  // Node 22.12+ / 24 load it with require().
  if (!copyMod) copyMod = require("../../public/server-page-copy.js");
  return copyMod;
}

const W = 1200;
const H = 630;
const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");
const FONT_HEAVY = { file: path.join(FONT_DIR, "InterDisplay-ExtraBold.otf"), family: "Inter Display ExtraBold" };
const FONT_TEXT = { file: path.join(FONT_DIR, "Inter-Medium.otf"), family: "Inter Medium" };
const BRAND = "#587AF5";
const MARK_PATH =
  "M67.58 62.5A27.25 27.25 0 1 1 37.5 32.42A5.75 5.75 0 0 1 38.76 43.85A15.75 15.75 0 1 0 56.15 61.24A5.75 5.75 0 0 1 67.58 62.5ZM32.42 37.5A27.25 27.25 0 1 1 62.5 67.58A5.75 5.75 0 0 1 61.24 56.15A15.75 15.75 0 1 0 43.85 38.76A5.75 5.75 0 0 1 32.42 37.5ZM44.25 50a5.75 5.75 0 1 0 11.5 0a5.75 5.75 0 1 0 -11.5 0Z";
const AVATAR_COLORS = ["#E8457A", "#19A2B3", "#9B5DE5", "#2DAA53", "#E1780F", "#3E7BFA", "#BB8E0A", "#5E5CE6"];

const FETCH_TIMEOUT_MS = 2500;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const CACHE_MAX = 300;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let wordmarkInner = null;
function wordmarkSvg(x, y, h) {
  if (wordmarkInner == null) {
    try {
      const raw = require("fs").readFileSync(path.join(__dirname, "..", "..", "public", "brand", "descall-wordmark-white.svg"), "utf8");
      const m = raw.match(/<svg[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>/);
      wordmarkInner = m ? { viewBox: m[1], body: m[2] } : { viewBox: "0 0 1 1", body: "" };
    } catch {
      wordmarkInner = { viewBox: "0 0 1 1", body: "" };
    }
  }
  const [, , vw, vh] = wordmarkInner.viewBox.split(/\s+/).map(Number);
  const w = vh > 0 ? (vw / vh) * h : 0;
  return { svg: `<svg x="${x}" y="${y}" width="${w.toFixed(1)}" height="${h}" viewBox="${wordmarkInner.viewBox}">${wordmarkInner.body}</svg>`, width: w };
}

function markSvg(x, y, s) {
  const r = s * 0.225;
  const scale = (s * 0.83) / 100;
  const off = s * 0.085;
  return `<g transform="translate(${x} ${y})"><rect width="${s}" height="${s}" rx="${r}" fill="#393C4D"/><path transform="translate(${off} ${off}) scale(${scale})" fill="${BRAND}" d="${MARK_PATH}"/></g>`;
}

function escapeMarkup(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PICTO_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

/** One line of display text: no control characters or emoji (the bundled font has none). */
function plain(value, max) {
  const s = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(PICTO_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function nf(lang, n) {
  try {
    return new Intl.NumberFormat(copy().copyFor(lang).intl).format(n);
  } catch {
    return String(n);
  }
}

function spanMarkup(value, color, fg, ls) {
  return `<span foreground="${color}"${fg}${ls}>${escapeMarkup(value)}</span>`;
}

/** Text layer -> { input: Buffer, width, height } (sharp/pango, bundled font). */
async function textLayer(text, { font = FONT_HEAVY, size, color = "#ffffff", width = null, spacing = 0, align = "left", lines = 1, alpha = 1 }) {
  const ls = spacing ? ` letter_spacing="${Math.round(spacing * 1024)}"` : "";
  const fg = alpha < 1 ? ` fgalpha="${Math.round(alpha * 100)}%"` : "";
  const markup = spanMarkup(text, color, fg, ls);
  const opts = {
    text: markup,
    font: `${font.family} ${size}`,
    fontfile: font.file,
    rgba: true,
    dpi: 72,
    align,
    wrap: "word",
  };
  if (width) opts.width = width;
  // Pango has no line clamp: measure, then cut words until it fits `lines` lines.
  let img = await sharp({ text: opts }).png().toBuffer({ resolveWithObject: true });
  const lineH = size * 1.3;
  let guard = 0;
  let body = String(text);
  while (lines && img.info.height > lineH * lines + size * 0.35 && guard < 40 && body.length > 4) {
    guard += 1;
    body = `${body.replace(/…$/, "").split(" ").slice(0, -1).join(" ").replace(/[,.;:\-–]$/, "")}…`;
    if (!body.trim() || body === "…") break;
    const shorter = { ...opts };
    shorter.text = spanMarkup(body, color, fg, ls);
    img = await sharp({ text: shorter }).png().toBuffer({ resolveWithObject: true });
  }
  return { input: img.data, width: img.info.width, height: img.info.height };
}

/** Single-line heading that shrinks (down to minSize) to fit maxWidth. */
async function fittedHeading(text, { size, minSize, maxWidth, color = "#ffffff", font = FONT_HEAVY, lines = 1 }) {
  let s = size;
  let layer = await textLayer(text, { font, size: s, color, width: lines > 1 ? maxWidth : null, lines });
  while (layer.width > maxWidth && s > minSize) {
    s = Math.max(minSize, Math.round(s * 0.88));
    layer = await textLayer(text, { font, size: s, color, width: lines > 1 ? maxWidth : null, lines });
  }
  if (layer.width > maxWidth) {
    // Still too long at the smallest size: cut characters.
    let t = String(text);
    while (layer.width > maxWidth && t.length > 3) {
      t = t.slice(0, -2);
      layer = await textLayer(`${t.trimEnd()}…`, { font, size: s, color });
    }
  }
  return { ...layer, size: s };
}

function storageHosts() {
  const hosts = new Set(["descall.com", "www.descall.com", "api.descall.com", "cdn.descall.com", "des-call.onrender.com"]);
  for (const raw of [process.env.SUPABASE_URL, process.env.MEDIA_PUBLIC_BASE_URL, process.env.PUBLIC_API_URL, process.env.RENDER_EXTERNAL_URL]) {
    try {
      if (raw) hosts.add(new URL(raw).hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  return hosts;
}

/** Only https images from our own storage (server icons / banners, avatars). */
function isAllowedImageUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  if (storageHosts().has(host)) return true;
  if (/\.supabase\.(co|in)$/.test(host)) return true;
  return /(^|\.)googleusercontent\.com$/.test(host);
}

async function fetchImage(url, fetchImpl = fetch) {
  if (!isAllowedImageUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, redirect: "error", headers: { accept: "image/*" } });
    if (!res.ok) return null;
    const len = Number(res.headers?.get?.("content-length") || 0);
    if (len > MAX_IMAGE_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
    // Decode check (animated images: first frame).
    await sharp(buf, { animated: false, limitInputPixels: 40_000_000 }).metadata();
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function roundedImage(buf, size, radius) {
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
  return sharp(buf, { animated: false, limitInputPixels: 40_000_000 })
    .resize(size, size, { fit: "cover", position: "centre" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

function initialOf(name) {
  const s = plain(name, 40);
  const ch = Array.from(s.replace(/[^\p{L}\p{N}]/gu, ""))[0];
  return ch ? ch.toLocaleUpperCase("tr-TR") : "D";
}

function colorFor(seed) {
  let h = 0;
  for (const c of String(seed || "")) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Icon tile: the image, or the initial on a colored tile. */
async function iconTile(buf, name, size, radius) {
  if (buf) {
    try {
      return await roundedImage(buf, size, radius);
    } catch {
      /* fall through */
    }
  }
  const letter = await textLayer(initialOf(name), { size: Math.round(size * 0.46), color: "#ffffff" });
  const bg = Buffer.from(`<svg width="${size}" height="${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colorFor(name)}"/><stop offset="1" stop-color="#393C4D"/></linearGradient></defs><rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/></svg>`);
  return sharp(bg)
    .composite([{ input: letter.input, left: Math.max(0, Math.round((size - letter.width) / 2)), top: Math.max(0, Math.round((size - letter.height) / 2)) }])
    .png()
    .toBuffer();
}

async function bannerBase(buf) {
  if (buf) {
    try {
      return await sharp(buf, { animated: false, limitInputPixels: 40_000_000 }).resize(W, H, { fit: "cover", position: "centre" }).removeAlpha().png().toBuffer();
    } catch {
      /* fall through */
    }
  }
  // No banner: the brand colour field (draft A, section 3).
  return sharp(Buffer.from(`<svg width="${W}" height="${H}"><defs>
    <radialGradient id="a" cx="85%" cy="20%" r="70%"><stop offset="0" stop-color="${BRAND}" stop-opacity=".75"/><stop offset="1" stop-color="${BRAND}" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx="100%" cy="100%" r="60%"><stop offset="0" stop-color="#9B5DE5" stop-opacity=".45"/><stop offset="1" stop-color="#9B5DE5" stop-opacity="0"/></radialGradient>
  </defs><rect width="${W}" height="${H}" fill="#121630"/><rect width="${W}" height="${H}" fill="url(#a)"/><rect width="${W}" height="${H}" fill="url(#b)"/></svg>`)).png().toBuffer();
}

/** Pills row (online dot on the first when asked). Returns { svg, layers }. */
async function pillsRow(items, { x, y, h = 62, gap = 16 }) {
  let cx = x;
  let svg = "";
  const layers = [];
  for (const it of items) {
    const t = await textLayer(it.text, { size: 28, color: "#ffffff" });
    const dot = it.dot ? 18 + 12 : 0;
    const w = 24 + dot + t.width + 24;
    svg += `<rect x="${cx}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#ffffff" fill-opacity=".12"/>`;
    if (it.dot) {
      svg += `<circle cx="${cx + 24 + 9}" cy="${y + h / 2}" r="15" fill="#23A55A" fill-opacity=".25"/><circle cx="${cx + 24 + 9}" cy="${y + h / 2}" r="9" fill="#23A55A"/>`;
    }
    layers.push({ input: t.input, left: Math.round(cx + 24 + dot), top: Math.round(y + (h - t.height) / 2) });
    cx += w + gap;
  }
  return { svg, layers, right: cx - gap };
}

async function brandBlock({ right, bottom, mark = 64, word = 34, url = null }) {
  const wmk = wordmarkSvg(0, 0, word);
  const totalW = mark + 14 + wmk.width;
  const x = W - right - totalW;
  const y = H - bottom - mark;
  let svg = markSvg(x, y, mark);
  const w2 = wordmarkSvg(x + mark + 14, y + (mark - word) / 2, word);
  svg += w2.svg;
  const layers = [];
  if (url) {
    const t = await textLayer(url, { font: FONT_TEXT, size: 24, color: "#EBEEFF", alpha: 0.75 });
    layers.push({ input: t.input, left: Math.round(W - right - t.width), top: Math.round(H - bottom + 38 - t.height) });
  }
  return { svg, layers };
}

/**
 * Server invite card. data: { name, description, iconUrl, bannerUrl, memberCount, onlineCount,
 * category, lang, urlText }.
 */
async function renderServerCard(data, { fetchImpl } = {}) {
  const lang = data.lang || "en";
  const c = copy().copyFor(lang);
  const [bannerBuf, iconBuf] = await Promise.all([fetchImage(data.bannerUrl, fetchImpl), fetchImage(data.iconUrl, fetchImpl)]);
  const base = await bannerBase(bannerBuf);
  const icon = await iconTile(iconBuf, data.name, 150, 38);
  const eyebrow = await textLayer(c.ogServer, { size: 24, color: "#a9bbff", spacing: 3.4 });
  const name = await fittedHeading(plain(data.name, 60) || "Descall", { size: 88, minSize: 56, maxWidth: W - 144 });
  const desc = data.description ? await textLayer(plain(data.description, 140), { font: FONT_TEXT, size: 31, color: "#EBEEFF", alpha: 0.86, width: 860, lines: 2 }) : null;
  const pills = [];
  if (Number(data.onlineCount) > 0) pills.push({ text: `${nf(lang, data.onlineCount)} ${c.online}`, dot: true });
  if (Number(data.memberCount) > 0) pills.push({ text: `${nf(lang, data.memberCount)} ${c.members}` });
  const cat = data.category ? copy().categoryLabel(lang, data.category) : null;
  if (cat && pills.length < 3) pills.push({ text: plain(cat, 24) });
  const row = await pillsRow(pills, { x: 72, y: H - 62 - 62 });
  const brand = await brandBlock({ right: 64, bottom: 66 + (data.urlText ? 18 : 0), url: data.urlText || null });

  const nameTop = 70 + 150 + 34 + eyebrow.height + 10;
  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>
    <linearGradient id="s1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#07080E" stop-opacity=".94"/><stop offset=".42" stop-color="#07080E" stop-opacity=".82"/><stop offset=".75" stop-color="#07080E" stop-opacity=".25"/><stop offset="1" stop-color="#07080E" stop-opacity=".05"/></linearGradient>
    <linearGradient id="s2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#07080E" stop-opacity=".7"/><stop offset=".35" stop-color="#07080E" stop-opacity="0"/></linearGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="20" stdDeviation="22" flood-color="#000" flood-opacity=".5"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#s1)"/><rect width="${W}" height="${H}" fill="url(#s2)"/>
  <rect x="66" y="64" width="162" height="162" rx="44" fill="#ffffff" fill-opacity=".12" filter="url(#sh)"/>
  ${row.svg}${brand.svg}</svg>`;

  const layers = [
    { input: Buffer.from(overlay), left: 0, top: 0 },
    { input: icon, left: 72, top: 70 },
    { input: eyebrow.input, left: 72, top: 70 + 150 + 34 },
    { input: name.input, left: 70, top: nameTop },
    ...(desc ? [{ input: desc.input, left: 72, top: nameTop + name.height + 12 }] : []),
    ...row.layers,
    ...brand.layers,
  ];
  return sharp(base).composite(layers).png({ compressionLevel: 8, palette: false }).toBuffer();
}

/** Group invite card. data: { name, memberCount, onlineCount, inviterName, avatars: [{ name, url }], lang }. */
async function renderGroupCard(data, { fetchImpl } = {}) {
  const lang = data.lang || "en";
  const c = copy().copyFor(lang);
  const avatars = (data.avatars || []).slice(0, 4);
  const sizes = [230, 200, 190, 170];
  const spots = [[0, 0], [190, 30], [40, 190], [215, 205]];
  const ox = W - 90 - 400;
  const oy = 120;
  const bufs = await Promise.all(avatars.map((a) => fetchImage(a.url, fetchImpl)));
  const tiles = [];
  for (let i = 0; i < avatars.length; i += 1) {
    const s = sizes[i];
    tiles.push({ input: await iconTile(bufs[i], avatars[i].name || data.name, s - 16, (s - 16) / 2), left: ox + spots[i][0] + 8, top: oy + spots[i][1] + 8 });
  }
  if (!avatars.length) {
    tiles.push({ input: await iconTile(null, data.name, 214, 107), left: ox + 90, top: oy + 70 });
  }
  const eyebrow = await textLayer(c.ogGroup, { size: 24, color: "#a9bbff", spacing: 3.4 });
  const name = await fittedHeading(plain(data.name, 60) || "Descall", { size: 84, minSize: 54, maxWidth: W - 72 - 520, lines: 2 });
  const sub = await textLayer(data.inviterName ? copy().fill(c.ogInvited, { name: plain(data.inviterName, 32) }) : c.ogGroupNoInviter, { font: FONT_TEXT, size: 31, color: "#EBEEFF", alpha: 0.86, width: W - 72 - 520, lines: 2 });
  const pills = [];
  if (Number(data.onlineCount) > 0) pills.push({ text: `${nf(lang, data.onlineCount)} ${c.online}`, dot: true });
  if (Number(data.memberCount) > 0) pills.push({ text: `${nf(lang, data.memberCount)} ${c.members}` });
  const row = await pillsRow(pills, { x: 72, y: H - 62 - 62 });
  const brand = await brandBlock({ right: 64, bottom: 40, mark: 56, word: 30 });
  const ring = avatars.map((a, i) => `<circle cx="${ox + spots[i][0] + sizes[i] / 2}" cy="${oy + spots[i][1] + sizes[i] / 2}" r="${sizes[i] / 2}" fill="#121630"/>`).join("");
  const bg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>
    <radialGradient id="a" cx="85%" cy="40%" r="67%"><stop offset="0" stop-color="${BRAND}" stop-opacity=".55"/><stop offset=".65" stop-color="${BRAND}" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx="100%" cy="100%" r="50%"><stop offset="0" stop-color="#9B5DE5" stop-opacity=".45"/><stop offset=".6" stop-color="#9B5DE5" stop-opacity="0"/></radialGradient>
  </defs><rect width="${W}" height="${H}" fill="#0d1024"/><rect width="${W}" height="${H}" fill="url(#a)"/><rect width="${W}" height="${H}" fill="url(#b)"/>${ring}${row.svg}${brand.svg}</svg>`;
  const top = 90;
  return sharp(Buffer.from(bg))
    .composite([
      ...tiles,
      { input: eyebrow.input, left: 72, top },
      { input: name.input, left: 70, top: top + eyebrow.height + 10 },
      { input: sub.input, left: 72, top: top + eyebrow.height + 10 + name.height + 14 },
      ...row.layers,
      ...brand.layers,
    ])
    .png({ compressionLevel: 8 })
    .toBuffer();
}

/** Expired / unknown invite: no server or group name, no image of theirs. */
async function renderInvalidCard({ lang = "en" } = {}) {
  const c = copy().copyFor(lang);
  const eyebrow = await textLayer(c.ogInvalidEyebrow, { size: 24, color: "#8b8fa3", spacing: 3.4 });
  const title = await textLayer(c.ogInvalidTitle, { size: 74, color: "#ffffff", width: 680, lines: 2 });
  const body = await textLayer(c.ogInvalidBody, { font: FONT_TEXT, size: 31, color: "#EBEEFF", alpha: 0.82, width: 860, lines: 2 });
  const brand = await brandBlock({ right: 64, bottom: 66 });
  const icon = `<g transform="translate(72 70)"><rect width="150" height="150" rx="38" fill="#262833"/><rect x="-6" y="-6" width="162" height="162" rx="44" fill="none" stroke="#ffffff" stroke-opacity=".06" stroke-width="6"/>
    <g transform="translate(35 35) scale(3.33)" fill="none" stroke="#8b8fa3" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7M15 7h2a5 5 0 0 1 4 8M8 12h4M2 2l20 20"/></g></g>`;
  const bg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>
    <radialGradient id="a" cx="80%" cy="20%" r="60%"><stop offset="0" stop-color="#6B6F80" stop-opacity=".25"/><stop offset="1" stop-color="#6B6F80" stop-opacity="0"/></radialGradient>
  </defs><rect width="${W}" height="${H}" fill="#121319"/><rect width="${W}" height="${H}" fill="url(#a)"/>${icon}${brand.svg}</svg>`;
  const eTop = 70 + 150 + 34;
  return sharp(Buffer.from(bg))
    .composite([
      { input: eyebrow.input, left: 72, top: eTop },
      { input: title.input, left: 70, top: eTop + eyebrow.height + 10 },
      { input: body.input, left: 72, top: eTop + eyebrow.height + 10 + title.height + 16 },
      ...brand.layers,
    ])
    .png({ compressionLevel: 8 })
    .toBuffer();
}

/** Small LRU with TTL and in-flight de-duplication. */
function createImageCache({ max = CACHE_MAX, ttlMs = CACHE_TTL_MS, now = () => Date.now() } = {}) {
  const map = new Map();
  const inflight = new Map();
  return {
    async get(key, build) {
      const hit = map.get(key);
      if (hit && now() - hit.at < ttlMs) {
        map.delete(key);
        map.set(key, hit);
        return hit.buf;
      }
      if (inflight.has(key)) return inflight.get(key);
      const p = (async () => {
        try {
          const buf = await build();
          map.set(key, { buf, at: now() });
          while (map.size > max) map.delete(map.keys().next().value);
          return buf;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, p);
      return p;
    },
    size: () => map.size,
    clear: () => map.clear(),
  };
}

module.exports = {
  W,
  H,
  renderServerCard,
  renderGroupCard,
  renderInvalidCard,
  createImageCache,
  isAllowedImageUrl,
  fetchImage,
  plain,
  initialOf,
};
