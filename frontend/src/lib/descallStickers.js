/**
 * Descall logo emoji and stickers (messaging phase 4). Original artwork
 * drawn here from the Descall mark: two open rings with rounded ends and a
 * centre dot on a 45° diagonal, brand blue #587AF5 (public/brand/
 * descall-symbol.svg). Only brand blues and white are used.
 *
 * Wire format is plain text, so no server or schema change is needed:
 *   - logo emoji  ":ds-<id>:" anywhere in a message, drawn inline;
 *   - a sticker   ":ds-sticker-<id>:" as the whole message, drawn large
 *     without a bubble. Older clients show the token as text.
 * Images are inline SVG data: URIs (CSP img-src allows data:), so they load
 * nothing and work offline, in Electron and on iOS.
 */

const BLUE = "#587AF5";
const DEEP = "#3E5BD8";
const LIGHT = "#8FA7FF";
const PALE = "#DCE4FF";
const WHITE = "#FFFFFF";

/** The Descall mark in its 100×100 space (centred on 50,50). */
export const MARK_PATH =
  "M67.58 62.5A27.25 27.25 0 1 1 37.5 32.42A5.75 5.75 0 0 1 38.76 43.85A15.75 15.75 0 1 0 56.15 61.24A5.75 5.75 0 0 1 67.58 62.5ZM32.42 37.5A27.25 27.25 0 1 1 62.5 67.58A5.75 5.75 0 0 1 61.24 56.15A15.75 15.75 0 1 0 43.85 38.76A5.75 5.75 0 0 1 32.42 37.5ZM44.25 50a5.75 5.75 0 1 0 11.5 0a5.75 5.75 0 1 0 -11.5 0Z";

/** The mark centred at (cx, cy), `size` wide (the mark is 75.5 units wide). */
function mark(cx, cy, size, fill = BLUE, extra = "") {
  const s = size / 75.5;
  return `<path transform="translate(${cx} ${cy}) scale(${s.toFixed(4)}) translate(-50 -50)" d="${MARK_PATH}" fill="${fill}"${extra}/>`;
}
/** White die-cut edge under a sticker shape. */
function cut(cx, cy, size, width) {
  return mark(cx, cy, size, WHITE, ` stroke="${WHITE}" stroke-width="${(width * 75.5 / size).toFixed(2)}" stroke-linejoin="round"`);
}
const HEART = "M60 104C30 84 12 66 12 44c0-14 10-25 24-25c10 0 18 6 24 15c6-9 14-15 24-15c14 0 24 11 24 25c0 22-18 40-48 60Z";
const star = (cx, cy, r, fill) => {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="${fill}" stroke-width="${(r * 0.18).toFixed(2)}" stroke-linejoin="round"/>`;
};
const sparkle = (cx, cy, r, fill) =>
  `<path d="M${cx} ${cy - r}C${cx + r * 0.12} ${cy - r * 0.12} ${cx + r * 0.12} ${cy - r * 0.12} ${cx + r} ${cy}C${cx + r * 0.12} ${cy + r * 0.12} ${cx + r * 0.12} ${cy + r * 0.12} ${cx} ${cy + r}C${cx - r * 0.12} ${cy + r * 0.12} ${cx - r * 0.12} ${cy + r * 0.12} ${cx - r} ${cy}C${cx - r * 0.12} ${cy - r * 0.12} ${cx - r * 0.12} ${cy - r * 0.12} ${cx} ${cy - r}Z" fill="${fill}"/>`;

function svg(viewBox, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
}

// ---- logo emoji (drawn at text size: the mark plus one small badge) -------------------

const badge = (inner) => `<circle cx="27" cy="27" r="8.6" fill="${WHITE}"/><circle cx="27" cy="27" r="7" fill="${BLUE}"/>${inner}`;
const EMOJI_ART = {
  descall: svg("0 0 36 36", cut(18, 18, 32, 2.6) + mark(18, 18, 32)),
  "ds-love": svg("0 0 36 36", cut(16, 16, 29, 2.6) + mark(16, 16, 29) + badge(`<path d="M27 31.2c-3-2-5-3.9-5-6.1c0-1.5 1.1-2.6 2.4-2.6c1.1 0 2 .6 2.6 1.6c.6-1 1.5-1.6 2.6-1.6c1.3 0 2.4 1.1 2.4 2.6c0 2.2-2 4.1-5 6.1Z" fill="${WHITE}"/>`)),
  "ds-ok": svg("0 0 36 36", cut(16, 16, 29, 2.6) + mark(16, 16, 29) + badge(`<path d="M23.4 27.2l2.4 2.4l4.8-5" fill="none" stroke="${WHITE}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`)),
  "ds-hype": svg("0 0 36 36", cut(16, 16, 29, 2.6) + mark(16, 16, 29) + badge(sparkle(27, 27, 5, WHITE))),
  "ds-gg": svg("0 0 36 36", cut(16, 16, 29, 2.6) + mark(16, 16, 29) + badge(star(27, 27.3, 4.6, WHITE))),
  "ds-call": svg("0 0 36 36", cut(18, 18, 22, 2.6) + mark(18, 18, 22) + `<path d="M5 11.5a14 14 0 0 0 0 13M31 11.5a14 14 0 0 1 0 13M8.6 14a8.6 8.6 0 0 0 0 8M27.4 14a8.6 8.6 0 0 1 0 8" fill="none" stroke="${WHITE}" stroke-width="4.6" stroke-linecap="round"/><path d="M5 11.5a14 14 0 0 0 0 13M31 11.5a14 14 0 0 1 0 13M8.6 14a8.6 8.6 0 0 0 0 8M27.4 14a8.6 8.6 0 0 1 0 8" fill="none" stroke="${LIGHT}" stroke-width="2.4" stroke-linecap="round"/>`),
};

// ---- stickers (120×120, white die-cut edge so they read on any background) -----------

const STICKER_ART = {
  hello: svg("0 0 120 120",
    cut(54, 64, 78, 9) + mark(54, 64, 78)
    + `<path d="M92 20c6 4 10 10 11 17M86 30c4 3 6 6 7 10" fill="none" stroke="${WHITE}" stroke-width="11" stroke-linecap="round"/>`
    + `<path d="M92 20c6 4 10 10 11 17M86 30c4 3 6 6 7 10" fill="none" stroke="${LIGHT}" stroke-width="5" stroke-linecap="round"/>`
    + sparkle(24, 24, 9, WHITE) + sparkle(24, 24, 6.5, LIGHT)),
  love: svg("0 0 120 120",
    `<path d="${HEART}" fill="${WHITE}" stroke="${WHITE}" stroke-width="12" stroke-linejoin="round"/>`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${LIGHT}"/><stop offset="1" stop-color="${DEEP}"/></linearGradient></defs>`
    + `<path d="${HEART}" fill="url(#g)"/>`
    + mark(60, 56, 46, WHITE)
    + `<path d="M28 38c2-6 7-10 13-10" fill="none" stroke="${WHITE}" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>`),
  party: svg("0 0 120 120",
    cut(60, 70, 74, 9) + mark(60, 70, 74)
    + `<path d="M48 30L60 4L72 30Z" fill="${WHITE}" stroke="${WHITE}" stroke-width="9" stroke-linejoin="round"/>`
    + `<path d="M48 30L60 4L72 30Z" fill="${LIGHT}"/><path d="M53 20h14M50.5 26h19" stroke="${WHITE}" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="5" r="5" fill="${PALE}" stroke="${WHITE}" stroke-width="2"/>`
    + `<rect x="14" y="30" width="9" height="5" rx="2.5" transform="rotate(-30 18 32)" fill="${BLUE}" stroke="${WHITE}" stroke-width="2"/>`
    + `<rect x="96" y="36" width="9" height="5" rx="2.5" transform="rotate(35 100 38)" fill="${LIGHT}" stroke="${WHITE}" stroke-width="2"/>`
    + `<circle cx="22" cy="58" r="4" fill="${LIGHT}" stroke="${WHITE}" stroke-width="2"/><circle cx="102" cy="64" r="4" fill="${BLUE}" stroke="${WHITE}" stroke-width="2"/>`
    + sparkle(96, 16, 7, WHITE) + sparkle(96, 16, 4.5, BLUE) + sparkle(16, 92, 6, WHITE) + sparkle(16, 92, 4, LIGHT)),
  gg: svg("0 0 120 120",
    `<path d="M34 16h52v22c0 16-11 28-26 28S34 54 34 38Z M28 22H14c0 14 8 22 20 24M92 22h14c0 14-8 22-20 24M60 66v18M42 100h36l-4-16H46Z" fill="${WHITE}" stroke="${WHITE}" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<path d="M28 22H16c0 13 7 20 18 22M92 22h12c0 13-7 20-18 22" fill="none" stroke="${LIGHT}" stroke-width="5" stroke-linecap="round"/>`
    + `<path d="M34 16h52v22c0 16-11 28-26 28S34 54 34 38Z" fill="${BLUE}"/><rect x="54" y="64" width="12" height="20" rx="3" fill="${DEEP}"/><path d="M42 100h36l-4-16H46Z" fill="${BLUE}"/><rect x="38" y="98" width="44" height="8" rx="4" fill="${DEEP}"/>`
    + mark(60, 38, 30, WHITE) + sparkle(100, 64, 7, WHITE) + sparkle(100, 64, 4.5, LIGHT)),
  call: svg("0 0 120 120",
    cut(60, 60, 58, 9) + mark(60, 60, 58)
    + `<path d="M18 36a42 42 0 0 0 0 48M102 36a42 42 0 0 1 0 48M28 44a28 28 0 0 0 0 32M92 44a28 28 0 0 1 0 32" fill="none" stroke="${WHITE}" stroke-width="12" stroke-linecap="round"/>`
    + `<path d="M18 36a42 42 0 0 0 0 48M102 36a42 42 0 0 1 0 48" fill="none" stroke="${LIGHT}" stroke-width="5.5" stroke-linecap="round"/>`
    + `<path d="M28 44a28 28 0 0 0 0 32M92 44a28 28 0 0 1 0 32" fill="none" stroke="${BLUE}" stroke-width="5.5" stroke-linecap="round"/>`),
  thinking: svg("0 0 120 120",
    cut(48, 72, 70, 9) + mark(48, 72, 70)
    + `<circle cx="86" cy="36" r="17" fill="${WHITE}"/><circle cx="86" cy="36" r="13" fill="${PALE}"/>`
    + `<circle cx="78" cy="36" r="2.8" fill="${BLUE}"/><circle cx="86" cy="36" r="2.8" fill="${BLUE}"/><circle cx="94" cy="36" r="2.8" fill="${BLUE}"/>`
    + `<circle cx="72" cy="58" r="6" fill="${WHITE}"/><circle cx="72" cy="58" r="3.6" fill="${PALE}"/><circle cx="64" cy="66" r="3.4" fill="${WHITE}"/><circle cx="64" cy="66" r="1.8" fill="${PALE}"/>`),
  sleep: svg("0 0 120 120",
    `<path d="M70 14a46 46 0 1 0 36 66a38 38 0 0 1-36-66Z" fill="${WHITE}" stroke="${WHITE}" stroke-width="12" stroke-linejoin="round"/>`
    + `<path d="M70 14a46 46 0 1 0 36 66a38 38 0 0 1-36-66Z" fill="${DEEP}"/>`
    + mark(54, 64, 46, LIGHT)
    + star(94, 22, 8, WHITE) + star(94, 22, 5.2, LIGHT) + star(106, 48, 5.5, WHITE) + star(106, 48, 3.4, PALE)),
  ok: svg("0 0 120 120",
    `<circle cx="60" cy="60" r="50" fill="${WHITE}"/><circle cx="60" cy="60" r="44" fill="${BLUE}"/>`
    + `<path d="M60 22A38 38 0 0 1 98 60" fill="none" stroke="${LIGHT}" stroke-width="5" stroke-linecap="round"/><path d="M60 98A38 38 0 0 1 22 60" fill="none" stroke="${LIGHT}" stroke-width="5" stroke-linecap="round"/>`
    + `<path d="M40 61l14 14l27-29" fill="none" stroke="${WHITE}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`),
};

const dataUri = (s) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;

/** Logo emoji: token, picker label key, image. */
export const DESCALL_EMOJI = Object.freeze(Object.keys(EMOJI_ART).map((id) => ({
  id,
  token: `:${id}:`,
  label: `msg4.stickers.emoji.${id}`,
  src: dataUri(EMOJI_ART[id]),
})));

/** Stickers: token, picker label key, image. */
export const DESCALL_STICKERS = Object.freeze(Object.keys(STICKER_ART).map((id) => ({
  id,
  token: `:ds-sticker-${id}:`,
  label: `msg4.stickers.sticker.${id}`,
  src: dataUri(STICKER_ART[id]),
})));

const EMOJI_BY_TOKEN = new Map(DESCALL_EMOJI.map((e) => [e.token, e]));
const STICKER_BY_TOKEN = new Map(DESCALL_STICKERS.map((s) => [s.token, s]));
export const EMOJI_TOKEN_RE = /:(descall|ds-love|ds-ok|ds-hype|ds-gg|ds-call):/g;

/** The sticker a message is (its whole text is one sticker token), or null. */
export function stickerOf(text) {
  if (typeof text !== "string") return null;
  return STICKER_BY_TOKEN.get(text.trim()) || null;
}

/** Split text into strings and logo emoji: [{ text } | { emoji }]. */
export function splitLogoEmoji(text) {
  const s = String(text || "");
  if (!s.includes(":d")) return [{ text: s }];
  const out = [];
  let last = 0;
  for (const m of s.matchAll(EMOJI_TOKEN_RE)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ emoji: EMOJI_BY_TOKEN.get(m[0]) });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out.length ? out : [{ text: s }];
}

/** Text for previews / notifications: a sticker is "Çıkartma", logo emoji a short name. */
export function stickerPreviewText(text, t = (k) => k) {
  if (stickerOf(text)) return t("msg4.stickers.preview");
  if (typeof text !== "string" || !text.includes(":d")) return text;
  return text.replace(EMOJI_TOKEN_RE, (tok) => t(EMOJI_BY_TOKEN.get(tok)?.label || tok));
}

/** Raw SVG markup (for the selftest and the design sheet). */
export function stickerSvg(id) {
  return STICKER_ART[id] || EMOJI_ART[id] || null;
}
