'use strict';

const fs = require('fs');
const path = require('path');

// 3.0.0 (A4, mockup 33): desktop notifications are a wide Liquid Glass capsule
// at the top centre of the screen (same as the approved mobile #07 toast):
// avatar (+ status dot or group badge) · name + context · one-line preview ·
// "Mesaj" pill and ×. Calls: "Ayşe arıyor..." with red / green round buttons.
// Sizes are DIPs — Electron scales them per monitor DPI.
const NOTIF_WIDTH = 480;
const NOTIF_HEIGHT = 66;
const NOTIF_HEIGHT_CALL = 66;
// App notices ("Descall arka planda çalışıyor…") may wrap to two lines.
const NOTIF_HEIGHT_NOTICE = 76;
/** Most toasts on screen at once; older non-call toasts are dismissed. */
const MAX_VISIBLE = 3;
// Room around the capsule so its soft shadow paints inside the transparent
// window. The OS window itself must stay empty at the corners.
const SHADOW_PAD = 28;

const ACCENT = {
  call: '#30d158',
  mention: '#ffd60a',
  default: '#587AF5',
};

// Same letter-avatar fallback as the app (src/lib/avatarFallback.js):
// AVATAR_PALETTE[crc32(user id) % 8], up to two initials, Turkish upper case.
const AVATAR_PALETTE = ['#2868FF', '#228359', '#BA590E', '#DB2C5B', '#7E59EE', '#177E96', '#926F16', '#DA362C'];

let CRC_TABLE = null;
function crc32(str) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  const bytes = Buffer.from(String(str ?? ''), 'utf8');
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function avatarColor(key) {
  const k = String(key ?? '');
  if (!k) return AVATAR_PALETTE[0];
  return AVATAR_PALETTE[crc32(k) % AVATAR_PALETTE.length];
}

let appIconDataUrl = null;

function appIconSrc() {
  if (appIconDataUrl != null) return appIconDataUrl;
  try {
    const buf = fs.readFileSync(path.join(__dirname, 'descall-icon.png'));
    appIconDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  } catch (_) {
    appIconDataUrl = '';
  }
  return appIconDataUrl;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const upperTr = (s) => {
  try { return s.toLocaleUpperCase('tr-TR'); } catch (_) { return s.toUpperCase(); }
};

/** "Ayşe Yılmaz" → "AY", "cinar.baskin" → "CB", "📞 Ada" → "A" (avatarInitials). */
function initialOf(value) {
  const parts = String(value || '')
    .replace(/[\uFE0F\u200D]/g, '')
    .trim()
    .replace(/^@+/, '')
    .split(/[\s._\-]+/u)
    .map((p) => p.replace(/^[^\p{L}\p{N}]+/u, ''))
    .filter(Boolean);
  if (!parts.length) return '';
  const first = Array.from(parts[0])[0] || '';
  const second = parts.length > 1 ? Array.from(parts[1])[0] || '' : '';
  return upperTr(first + second);
}

function safeImageUrl(url) {
  const s = String(url || '').trim();
  return /^(https:\/\/|data:image\/(png|jpe?g|gif|webp);base64,)/i.test(s) ? s : '';
}

function resolveMark({ avatarUrl, appIcon, title, from, avatarKey }) {
  const name = from || title;
  const letter = initialOf(name) || '•';
  const color = avatarColor(avatarKey || name || '');
  const src = safeImageUrl(avatarUrl);
  if (src) return { kind: 'photo', src, letter, color };
  if (appIcon) return { kind: 'app', src: appIconSrc(), letter: '' };
  return { kind: 'letter', letter, color };
}

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** "Mert: Kaleci kim?" → "Kaleci kim?" when the body repeats the sender. */
function stripSender(body, from) {
  const b = String(body || '');
  const f = String(from || '');
  if (f && b.startsWith(`${f}: `)) return b.slice(f.length + 2);
  return b;
}

/**
 * Capsule content for a notification (pure, unit-tested). The renderer sends
 * { title, body, data }; this decides name / context / preview / badge /
 * action exactly as in mockup 33.
 *   kind:    message | call | online | notice
 *   badge:   online (green dot) | group | server | null
 *   action:  message ("Mesaj" pill) | null
 */
function describeNotification({ title = '', body = '', data = {}, appIcon = false, avatarUrl = null } = {}) {
  const d = data && typeof data === 'object' ? data : {};
  const type = String(d.type || '');
  const base = { avatarUrl: avatarUrl || d.avatarUrl || null, appIcon: false, avatarKey: d.fromId || d.userId || '' };
  const preview = (text) => clip(text, 160);
  switch (type) {
    case 'call': {
      const name = d.callerName || d.from || title || 'Descall';
      return { ...base, kind: 'call', name, from: name, context: 'arıyor...', contextTone: 'live', preview: preview(body || (d.callType === 'video' ? 'Görüntülü arama' : 'Sesli arama')), badge: null, action: null };
    }
    case 'group-call': {
      const name = d.from || d.groupName || title || 'Descall';
      return { ...base, kind: 'call', name, from: name, context: 'arıyor...', contextTone: 'live', preview: preview(d.groupName ? `👥 ${d.groupName} · Grup araması` : 'Grup araması'), badge: 'group', action: null };
    }
    case 'dm':
      return { ...base, kind: 'message', name: d.from || title, from: d.from || title, context: 'şimdi', preview: preview(d.preview || body), badge: 'online', action: 'message' };
    case 'group':
      return { ...base, kind: 'message', name: d.from || title, from: d.from || title, avatarKey: base.avatarKey || d.from || '', context: d.groupName || '', preview: preview(d.preview || stripSender(body, d.from)), badge: 'group', action: 'message' };
    case 'server-message':
      return { ...base, kind: 'message', name: d.from || title, from: d.from || title, context: [d.channelName ? `#${d.channelName}` : '', d.serverName || ''].filter(Boolean).join(' · '), preview: preview(d.preview || stripSender(body, d.from)), badge: 'server', action: 'message' };
    case 'mention':
      return { ...base, kind: 'message', name: d.from || title, from: d.from || title, context: 'seni etiketledi', contextTone: 'mention', preview: preview(d.preview || body), badge: d.groupId ? 'group' : (d.serverId || d.channelId ? 'server' : 'online'), action: 'message' };
    case 'friend-online': {
      const who = d.username || d.from || '';
      return { ...base, kind: 'online', name: `${who} çevrimiçi`, from: who, avatarKey: base.avatarKey || who, context: '', preview: 'Az önce bağlandı', badge: 'online', action: d.userId ? 'message' : null };
    }
    case 'missed-call':
      return { ...base, kind: 'message', name: d.from || title, from: d.from || title, context: 'cevapsız arama', contextTone: 'missed', preview: preview(body), badge: null, action: 'message' };
    default:
      return { ...base, appIcon: Boolean(appIcon) && !base.avatarUrl, kind: 'notice', name: title || 'Descall', from: title, context: '', preview: preview(body), badge: null, action: null };
  }
}

function cardHeightFor(type, kind) {
  if (type === 'call' || kind === 'call') return NOTIF_HEIGHT_CALL;
  if (kind === 'notice') return NOTIF_HEIGHT_NOTICE;
  return NOTIF_HEIGHT;
}

function markHtml(mark) {
  if (mark.kind === 'app' && mark.src) {
    return `<img class="mark app" src="${mark.src}" alt="" />`;
  }
  const letter = escapeHtml(mark.letter);
  const bg = escapeHtml(mark.color || AVATAR_PALETTE[0]);
  if (mark.kind === 'photo') {
    const src = escapeHtml(mark.src);
    return `<img class="mark photo" src="${src}" alt="" onerror="this.outerHTML='<div class=&quot;mark letter&quot; style=&quot;background:${bg}&quot;>${letter}</div>'" />`;
  }
  return `<div class="mark letter" style="background:${bg}">${letter}</div>`;
}

const GROUP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
const MESSAGE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
const PHONE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
const PHONE_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="22" y1="2" x2="2" y2="22"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function badgeHtml(badge) {
  if (badge === 'online') return '<i class="badge dot" aria-hidden="true"></i>';
  if (badge === 'group') return `<i class="badge group" aria-hidden="true">${GROUP_SVG}</i>`;
  if (badge === 'server') return '<i class="badge group server" aria-hidden="true">#</i>';
  return '';
}

function notificationCss() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent !important;
      background-color: transparent !important;
      color: rgba(255, 255, 255, 0.96);
      font-family: "Inter", -apple-system, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      user-select: none;
      -webkit-user-select: none;
    }
    body.preview {
      overflow: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 28px;
    }
    .stage {
      width: 100%;
      height: 100%;
      padding: ${SHADOW_PAD}px;
      background: transparent;
    }
    .card {
      --accent: ${ACCENT.default};
      width: 100%;
      height: 100%;
      border-radius: 999px;
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 14px 0 11px;
      /* Liquid Glass capsule. A separate always-on-top window: backdrop-filter
         cannot sample other OS windows, so the tinted base is near-opaque and
         carries the glass look itself (sheen + rim). No backdrop-filter, so the
         entrance blur cannot hit the 2.13.6 dark-box compositing bug. */
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.075) 0%, rgba(255, 255, 255, 0.015) 55%, rgba(255, 255, 255, 0) 100%),
        rgba(30, 32, 44, 0.965);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow:
        0 16px 40px rgba(0, 0, 0, 0.42),
        0 2px 8px rgba(0, 0, 0, 0.24),
        inset 0 1px 0 rgba(255, 255, 255, 0.10);
      cursor: pointer;
      opacity: 0;
      transform: translate3d(0, -26px, 0);
      will-change: transform, opacity, filter;
      touch-action: none;
    }
    body.preview .card { width: ${NOTIF_WIDTH}px; flex: none; }
    .card:hover {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.02) 55%, rgba(255, 255, 255, 0) 100%),
        rgba(34, 36, 50, 0.97);
    }
    .card.call { border-color: rgba(48, 209, 88, 0.42); cursor: default; }
    .card.notice { border-radius: 26px; }
    .avatar-wrap { position: relative; width: 44px; height: 44px; flex-shrink: 0; }
    .mark { width: 44px; height: 44px; display: block; object-fit: cover; }
    .mark.app { border-radius: 11px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28); }
    .mark.photo { border-radius: 50%; }
    .mark.letter {
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: #fff;
    }
    .badge {
      position: absolute;
      right: -3px;
      bottom: -3px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .badge.dot {
      width: 17px;
      height: 17px;
      border-radius: 50%;
      background: #30d158;
      border: 2.5px solid rgb(30, 32, 44);
    }
    .badge.group {
      width: 22px;
      height: 22px;
      border-radius: 7px;
      background: #5865f2;
      border: 2px solid rgb(30, 32, 44);
      font-size: 10px;
      font-weight: 800;
    }
    .badge.group svg { width: 12px; height: 12px; }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
    .line1 { display: flex; align-items: baseline; gap: 6px; min-width: 0; white-space: nowrap; }
    .title-text {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 15px;
      font-weight: 650;
      letter-spacing: -0.012em;
      color: rgba(255, 255, 255, 0.97);
    }
    .ctx {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 13px;
      font-weight: 450;
      color: rgba(235, 238, 255, 0.50);
    }
    .ctx:empty { display: none; }
    .ctx.live { color: #30d158; font-weight: 550; }
    .ctx.mention { color: #ffd60a; }
    .ctx.missed { color: #ff6961; }
    .body-text {
      font-size: 14px;
      font-weight: 450;
      line-height: 1.3;
      color: rgba(235, 238, 255, 0.76);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card.notice .body-text {
      white-space: normal;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow-wrap: break-word;
    }
    .count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 16px;
      padding: 0 5px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 650;
      align-self: center;
      color: rgba(255, 255, 255, 0.92);
      background: rgba(255, 255, 255, 0.16);
    }
    .count:empty { display: none; }
    .pill {
      flex-shrink: 0;
      height: 39px;
      padding: 0 17px 0 15px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.10);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.15));
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 2px 6px rgba(0, 0, 0, 0.18);
      color: #fff;
      font: inherit;
      font-size: 14.5px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 120ms ease-out, background 120ms ease-out;
    }
    .pill svg { width: 15px; height: 15px; display: block; }
    .pill:hover { background: linear-gradient(180deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0.17)); }
    .pill:active { transform: scale(0.95); }
    .close-btn {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      margin: 0 -2px 0 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 999px;
      background: transparent;
      color: rgba(235, 238, 255, 0.62);
      cursor: pointer;
    }
    .close-btn svg { width: 13px; height: 13px; display: block; }
    .close-btn:hover { background: rgba(255, 255, 255, 0.10); color: #fff; }
    .pill:focus-visible, .close-btn:focus-visible, .call-btns button:focus-visible {
      outline: 2px solid rgba(255, 255, 255, 0.85);
      outline-offset: 2px;
    }
    /* ── Incoming call ─────────────────────────────────────────────── */
    .card.call .avatar-wrap::after {
      content: "";
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      border: 1.5px solid rgba(48, 209, 88, 0.55);
      animation: ringPulse 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      pointer-events: none;
    }
    @keyframes ringPulse {
      0% { transform: scale(0.94); opacity: 0.9; }
      70% { transform: scale(1.16); opacity: 0; }
      100% { transform: scale(1.16); opacity: 0; }
    }
    .call-btns { display: flex; gap: 12px; flex-shrink: 0; margin-right: -4px; }
    .call-btns button {
      width: 41px;
      height: 41px;
      border-radius: 50%;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 120ms ease-out, filter 120ms ease-out;
    }
    .call-btns button:hover { filter: brightness(1.1); }
    .call-btns button:active { transform: scale(0.92); }
    .call-btns svg { width: 19px; height: 19px; display: block; }
    .decline { background: #ff453a; color: #fff; box-shadow: 0 4px 12px rgba(255, 69, 58, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.25); }
    .accept { background: #30d158; color: #0b2a14; box-shadow: 0 4px 12px rgba(48, 209, 88, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.30); }
    @media (prefers-reduced-motion: reduce) {
      .card { opacity: 1; transform: none; filter: none; }
      .card.call .avatar-wrap::after { animation: none; opacity: 0.6; }
    }
    @media (prefers-reduced-transparency: reduce) {
      .card { background: #1e2030; }
    }
    @media (prefers-contrast: more) {
      .card { background: #0c0e14; border-color: #fff; }
      .title-text, .body-text, .ctx, .close-btn { color: #fff; }
      .accept { background: #1f9e45; color: #fff; }
      .decline { background: #d9342b; }
    }
  `;
}

function capsuleInner(model, { duration = 0, count = 1, accent = ACCENT.default } = {}) {
  const isCall = model.kind === 'call';
  const mark = resolveMark({ avatarUrl: model.avatarUrl, appIcon: model.appIcon, title: model.name, from: model.from, avatarKey: model.avatarKey });
  const name = escapeHtml(model.name || 'Descall');
  const ctx = escapeHtml(model.context || '');
  const tone = model.contextTone ? ` ${escapeHtml(model.contextTone)}` : '';
  const preview = escapeHtml(model.preview || '');
  const countText = Number(count) > 1 ? String(Math.min(99, Number(count))) : '';
  const label = escapeHtml([model.name, model.context, model.preview].filter(Boolean).join(', '));
  const avatar = `<div class="avatar-wrap">${markHtml(mark)}${badgeHtml(model.badge)}</div>`;
  const text = `<div class="text">
          <div class="line1"><span class="title-text">${name}</span><span class="ctx${tone}">${ctx}</span><span class="count">${countText}</span></div>
          <div class="body-text">${preview}</div>
        </div>`;
  if (isCall) {
    return `
    <div class="card call" role="alertdialog" aria-label="${label}" style="--accent:${ACCENT.call}" data-duration="0">
      ${avatar}
      ${text}
      <div class="call-btns">
        <button class="decline" type="button" title="Reddet" aria-label="Reddet" data-act="decline">${PHONE_OFF_SVG}</button>
        <button class="accept" type="button" title="Kabul et" aria-label="Kabul et" data-act="accept">${PHONE_SVG}</button>
      </div>
    </div>`;
  }
  const pill = model.action === 'message'
    ? `<button class="pill" type="button" data-act="click" aria-label="Mesaj">${MESSAGE_SVG}<span>Mesaj</span></button>`
    : '';
  return `
    <div class="card ${model.kind === 'notice' ? 'notice' : 'msg'}" role="status" aria-label="${label}" style="--accent:${accent}" data-duration="${Number(duration) || 0}">
      ${avatar}
      ${text}
      ${pill}
      <button class="close-btn" type="button" data-act="close" aria-label="Kapat" title="Kapat">${CLOSE_SVG}</button>
    </div>`;
}

function motionScript() {
  return `
    <script>
      (function () {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // Spring: damping ratio 1.0, response 0.35 s (mobile #07).
        const omega = (2 * Math.PI) / 0.35;
        const ENTER_FROM = -26;
        const BLUR_FROM = 10;
        function render(el, y, opacity) {
          const blur = Math.min(BLUR_FROM, Math.abs(y) / Math.abs(ENTER_FROM) * BLUR_FROM);
          el.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
          el.style.opacity = opacity.toFixed(3);
          el.style.filter = blur > 0.05 ? 'blur(' + blur.toFixed(2) + 'px)' : 'none';
        }
        // Slides down from above while going from blurred to sharp.
        function springTo(el, state, target, done) {
          if (reduce) {
            el.style.opacity = '1';
            el.style.transform = 'none';
            el.style.filter = 'none';
            if (done) done();
            return;
          }
          let last = performance.now();
          const step = (now) => {
            if (state.dragging || state.leaving) return;
            const dt = Math.min(0.032, (now - last) / 1000);
            last = now;
            const accel = -(omega * omega) * (state.y - target) - (2 * omega) * state.v;
            state.v += accel * dt;
            state.y += state.v * dt;
            state.o = Math.min(1, state.o + dt / 0.18);
            render(el, state.y, state.o);
            if (Math.abs(state.y - target) > 0.3 || Math.abs(state.v) > 4 || state.o < 1) requestAnimationFrame(step);
            else {
              state.y = target;
              state.v = 0;
              el.style.transform = 'translate3d(0,0,0)';
              el.style.opacity = '1';
              el.style.filter = 'none';
              if (done) done();
            }
          };
          requestAnimationFrame(step);
        }
        // Exit: up and out (with the swipe's momentum when there is one).
        function leaveUp(el, state, velocity, done) {
          if (reduce) {
            el.style.transition = 'opacity 160ms ease';
            el.style.opacity = '0';
            setTimeout(done, 160);
            return;
          }
          const v = Math.min(-0.25, velocity || -0.25); // px per ms, upwards
          const ms = Math.max(140, Math.min(260, Math.round(60 / Math.abs(v))));
          const to = Math.min(state.y - 40, -46);
          el.style.transition = 'opacity ' + ms + 'ms cubic-bezier(0.4,0,1,1), transform ' + ms + 'ms cubic-bezier(0.3,0.6,0.6,1)';
          el.style.filter = 'none';
          el.style.opacity = '0';
          el.style.transform = 'translate3d(0,' + to + 'px,0) scale(0.97)';
          setTimeout(done, ms);
        }
        const card = document.querySelector('.card');
        if (!card) return;
        const state = { y: ENTER_FROM, v: 0, o: 0, dragging: false, leaving: false };
        if (!reduce) render(card, state.y, 0);
        springTo(card, state, 0);
        const duration = Number(card.getAttribute('data-duration')) || 0;
        let remaining = duration;
        let running = true;
        let last = performance.now();
        function beginDismiss(action, velocity) {
          if (state.leaving) return;
          state.leaving = true;
          const finish = () => {
            if (action === 'click') window.notifAPI?.click();
            else if (action === 'accept') window.notifAPI?.accept();
            else if (action === 'decline') window.notifAPI?.decline();
            else window.notifAPI?.close();
          };
          leaveUp(card, state, velocity, finish);
        }
        window.__notifClick = () => beginDismiss('click');
        window.__notifClose = () => beginDismiss('close');
        window.__notifAccept = () => beginDismiss('accept');
        window.__notifDecline = () => beginDismiss('decline');
        window.__notifState = () => ({ y: state.y, leaving: state.leaving, remaining, running });
        // Grouped update (same chat): new text, count chip, timer restarts.
        window.notifAPI?.onUpdate?.((next) => {
          if (state.leaving || !next) return;
          const t = card.querySelector('.title-text');
          const b = card.querySelector('.body-text');
          const x = card.querySelector('.ctx');
          const c = card.querySelector('.count');
          if (t && typeof next.title === 'string') t.textContent = next.title;
          if (b && typeof next.body === 'string') b.textContent = next.body;
          if (x && typeof next.context === 'string') x.textContent = next.context;
          if (c) c.textContent = Number(next.count) > 1 ? String(Math.min(99, Number(next.count))) : '';
          remaining = duration;
          last = performance.now();
          if (!reduce && card.animate) {
            card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.015)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(0.2,0.8,0.2,1)' });
          }
        });
        if (duration > 0) {
          const tick = (now) => {
            if (state.leaving) return;
            if (running && !state.dragging) {
              remaining -= now - last;
              if (remaining <= 0) { remaining = 0; beginDismiss('timeout'); return; }
            }
            last = now;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          card.addEventListener('mouseenter', () => { running = false; window.notifAPI?.pause(); });
          card.addEventListener('mouseleave', () => {
            if (state.leaving) return;
            running = true;
            last = performance.now();
            window.notifAPI?.resume(remaining);
          });
        }
        // Buttons: Mesaj (= open chat), ×, Reddet, Kabul et.
        card.querySelectorAll('[data-act]').forEach((btn) => {
          btn.addEventListener('pointerdown', (e) => e.stopPropagation());
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            beginDismiss(btn.getAttribute('data-act'));
          });
        });
        // Body: click opens the chat (calls: buttons only); swipe up dismisses
        // with momentum; pulling down rubber-bands and springs back.
        let start = null;
        card.addEventListener('pointerdown', (e) => {
          if (state.leaving || e.button !== 0) return;
          start = { y: e.clientY, t: performance.now(), lastY: e.clientY, lastT: performance.now(), v: 0, moved: false };
          state.dragging = true;
          try { card.setPointerCapture(e.pointerId); } catch (_) {}
        });
        card.addEventListener('pointermove', (e) => {
          if (!start || state.leaving) return;
          const now = performance.now();
          const dy = e.clientY - start.y;
          if (Math.abs(dy) > 4) start.moved = true;
          const dt = Math.max(1, now - start.lastT);
          start.v = (e.clientY - start.lastY) / dt;
          start.lastY = e.clientY;
          start.lastT = now;
          state.y = dy < 0 ? dy : dy * 0.25;
          state.o = 1;
          if (!reduce) {
            card.style.transform = 'translate3d(0,' + state.y.toFixed(2) + 'px,0)';
            card.style.opacity = dy < 0 ? String(Math.max(0.35, 1 + dy / 80)) : '1';
          }
        });
        const end = (e) => {
          if (!start) return;
          const s = start;
          start = null;
          state.dragging = false;
          try { card.releasePointerCapture(e.pointerId); } catch (_) {}
          if (state.leaving) return;
          if (!s.moved) {
            state.y = 0;
            if (!card.classList.contains('call')) beginDismiss('click');
            return;
          }
          if (state.y < -24 || s.v < -0.45) { beginDismiss('close', s.v); return; }
          state.v = 0;
          springTo(card, state, 0);
        };
        card.addEventListener('pointerup', end);
        card.addEventListener('pointercancel', end);
      })();
    <\/script>`;
}

/**
 * Full HTML for one notification window. Pass a `model` from
 * describeNotification(); without one the legacy { title, body, type } fields
 * are described as a notice / call.
 */
function buildNotificationHtml({
  title,
  body,
  type = 'default',
  avatarUrl = null,
  appIcon = false,
  from = null,
  duration = 5000,
  preview = false,
  count = 1,
  model = null,
} = {}) {
  const isCall = type === 'call';
  const accent = ACCENT[type] || ACCENT.default;
  const m = model || (isCall
    ? describeNotification({ title, body, data: { type: 'call', callerName: title || from }, avatarUrl })
    : { ...describeNotification({ title, body, appIcon, avatarUrl }), from: from || title });
  const inner = capsuleInner(m, { duration: isCall || m.kind === 'call' ? 0 : duration, count, accent });
  const shell = preview ? inner : `<div class="stage">${inner}</div>`;
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${notificationCss()}</style></head>
    <body class="${preview ? 'preview' : ''}">${shell}${motionScript()}</body></html>`;
}

/** Static sheet of capsules (screenshots / visual compare). Items: describeNotification input. */
function buildNotificationGallery(items) {
  const cards = items.map((item) => {
    const model = item.model || describeNotification(item);
    const height = item.height || cardHeightFor(model.kind === 'call' ? 'call' : 'default', model.kind);
    return `<div class="slot" style="width:${NOTIF_WIDTH}px;height:${height}px">${capsuleInner(model, { duration: 0, count: item.count || 1 })}</div>`;
  }).join('');
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><style>${notificationCss()}
    body.preview .slot { flex: none; }
    body.preview .slot .card { width: 100%; height: 100%; opacity: 1; transform: none; }
  </style></head><body class="preview">${cards}</body></html>`;
}

module.exports = {
  NOTIF_WIDTH,
  NOTIF_HEIGHT,
  NOTIF_HEIGHT_CALL,
  NOTIF_HEIGHT_NOTICE,
  MAX_VISIBLE,
  SHADOW_PAD,
  ACCENT,
  AVATAR_PALETTE,
  crc32,
  avatarColor,
  appIconSrc,
  initialOf,
  resolveMark,
  describeNotification,
  cardHeightFor,
  buildNotificationHtml,
  buildNotificationGallery,
};
