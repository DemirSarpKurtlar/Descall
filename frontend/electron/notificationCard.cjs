'use strict';

const fs = require('fs');
const path = require('path');

// Compact, macOS-like proportions (in DIPs — Electron scales them per
// monitor DPI, so the card is the same physical size at 100–200 %).
const NOTIF_WIDTH = 344;
const NOTIF_HEIGHT = 96;
// Incoming call: one horizontal row — avatar · name / "Sesli arama" · round
// Reddet / Kabul et glass buttons. Shorter than a message card on purpose.
const NOTIF_HEIGHT_CALL = 84;
/** Most toasts on screen at once; older non-call toasts are dismissed. */
const MAX_VISIBLE = 3;
// Room around the card so its soft shadow paints inside the transparent
// window. The OS window itself must stay empty at the corners.
const SHADOW_PAD = 28;

const ACCENT = {
  call: '#30d158',
  mention: '#ffd60a',
  default: '#587AF5',
};

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
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initialOf(value) {
  const stripped = String(value || '')
    .replace(/[\uFE0F\u200D]/g, '')
    .replace(/^[\s\p{Extended_Pictographic}]+/u, '')
    .trim();
  const ch = Array.from(stripped)[0] || '';
  return ch ? ch.toLocaleUpperCase() : '';
}

function resolveMark({ avatarUrl, appIcon, title, from }) {
  if (avatarUrl) return { kind: 'photo', src: String(avatarUrl), letter: initialOf(from || title) || '•' };
  if (appIcon) return { kind: 'app', src: appIconSrc(), letter: '' };
  return { kind: 'letter', letter: initialOf(from || title) || '•' };
}

function cardHeightFor(type) {
  return type === 'call' ? NOTIF_HEIGHT_CALL : NOTIF_HEIGHT;
}

function markHtml(mark) {
  if (mark.kind === 'app' && mark.src) {
    return `<img class="mark app" src="${mark.src}" alt="" />`;
  }
  if (mark.kind === 'photo') {
    const src = escapeHtml(mark.src);
    const letter = escapeHtml(mark.letter);
    return `<img class="mark photo" src="${src}" alt="" onerror="this.outerHTML='<div class=&quot;mark letter&quot;>${letter}</div>'" />`;
  }
  return `<div class="mark letter">${escapeHtml(mark.letter)}</div>`;
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
      font-family: -apple-system, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      user-select: none;
      -webkit-user-select: none;
    }
    body.preview {
      overflow: auto;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 14px;
      padding: 36px 28px;
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
      border-radius: 22px;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 12px 12px 14px 14px;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.02)),
        rgba(18, 20, 30, 0.97);
      /* A separate always-on-top window: backdrop-filter cannot sample other
         OS windows, so the near-opaque tinted base is what keeps the desktop
         behind unreadable (2.13.x modal audit). */
      -webkit-backdrop-filter: blur(40px) saturate(180%);
      backdrop-filter: blur(40px) saturate(180%);
      box-shadow:
        0 22px 50px rgba(0, 0, 0, 0.32),
        0 2px 8px rgba(0, 0, 0, 0.20),
        inset 0 1px 0 rgba(255, 255, 255, 0.48),
        inset 0 0 0 0.5px rgba(255, 255, 255, 0.16);
      cursor: pointer;
      opacity: 0;
      transform: translate3d(36px, 0, 0);
      will-change: transform, opacity;
    }
    .card.leaving {
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
    body.preview .card {
      width: ${NOTIF_WIDTH}px;
      flex: none;
    }
    .card:hover {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04)),
        rgba(24, 26, 38, 0.975);
    }
    .row { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
    .mark {
      width: 40px;
      height: 40px;
      flex-shrink: 0;
      object-fit: cover;
    }
    .mark.app { border-radius: 12px; box-shadow: 0 8px 18px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.28); }
    .mark.photo { border-radius: 50%; }
    .mark.letter {
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      font-weight: 650;
      letter-spacing: -0.02em;
      color: rgba(255, 255, 255, 0.96);
      background: rgba(255, 255, 255, 0.14);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.40), inset 0 0 0 0.5px rgba(255, 255, 255, 0.18);
    }
    .text { flex: 1; min-width: 0; padding-top: 1px; }
    .title, .body-text {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      white-space: normal;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .title {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: -0.014em;
      line-height: 1.3;
      color: rgba(255, 255, 255, 0.96);
    }
    .body-text {
      margin-top: 3px;
      font-size: 12.5px;
      font-weight: 450;
      line-height: 1.35;
      color: rgba(235, 238, 255, 0.74);
    }
    .close-btn {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      margin-top: -2px;
      border: none;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.72);
      font-size: 13px;
      line-height: 1;
      cursor: pointer;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }
    .close-btn:hover { background: rgba(255, 255, 255, 0.16); color: white; }
    .count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 16px;
      margin-left: 6px;
      padding: 0 5px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 650;
      vertical-align: 1px;
      color: rgba(255, 255, 255, 0.92);
      background: rgba(255, 255, 255, 0.16);
      box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.35);
    }
    .count:empty { display: none; }
    /* ── Incoming call: one compact row ─────────────────────────────── */
    .card.call { padding: 0 14px 0 14px; cursor: default; }
    .card.call .row { align-items: center; gap: 12px; height: 100%; }
    .card.call .mark { width: 44px; height: 44px; }
    .avatar-wrap { position: relative; width: 44px; height: 44px; flex-shrink: 0; }
    .avatar-wrap::after {
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
    .card.call .title { -webkit-line-clamp: 1; font-size: 14px; }
    .card.call .body-text { -webkit-line-clamp: 1; margin-top: 2px; font-size: 12.5px; }
    .call-btns { display: flex; gap: 10px; flex-shrink: 0; }
    .call-btns button {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      cursor: pointer;
      border: 0.5px solid rgba(255, 255, 255, 0.26);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      backdrop-filter: blur(20px) saturate(180%);
      transition: transform 120ms ease-out, filter 120ms ease-out;
    }
    .call-btns button:hover { filter: brightness(1.12); }
    .call-btns button:active { transform: scale(0.92); }
    .call-btns button:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.85); outline-offset: 2px; }
    .call-btns svg { width: 19px; height: 19px; display: block; }
    /* Tinted glass, not flat fills (green / red Liquid Glass). */
    .accept {
      background: linear-gradient(180deg, rgba(64, 222, 104, 0.72), rgba(36, 178, 74, 0.58));
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 6px 16px rgba(48, 209, 88, 0.30);
    }
    .decline {
      background: linear-gradient(180deg, rgba(255, 92, 82, 0.72), rgba(220, 52, 44, 0.58));
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 6px 16px rgba(255, 69, 58, 0.28);
    }
    .decline svg { transform: rotate(135deg); }
    .progress {
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: 6px;
      height: 2px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.14);
      overflow: hidden;
    }
    .progress > i {
      display: block;
      height: 100%;
      width: 100%;
      border-radius: inherit;
      background: var(--accent);
      opacity: 0.9;
      transform: scaleX(1);
      transform-origin: left center;
    }
    @media (prefers-reduced-motion: reduce) {
      .card { opacity: 1; transform: none; filter: none; }
      .avatar-wrap::after { animation: none; opacity: 0.6; }
    }
    @media (prefers-reduced-transparency: reduce) {
      .card {
        background: #161820;
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
      }
    }
    @media (prefers-contrast: more) {
      .card {
        background: #0c0e14;
        box-shadow: inset 0 0 0 1px #fff, 0 18px 40px rgba(0, 0, 0, 0.45);
      }
      .title, .body-text, .close-btn { color: #fff; }
      .accept { background: #1f9e45; }
      .decline { background: #d9342b; }
    }
  `;
}

const PHONE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>';

function callCardInner({ title, body, mark, accent }) {
  const safeTitle = escapeHtml(title || 'Descall');
  const safeBody = escapeHtml(body || 'Sesli arama');
  return `
    <div class="card call" role="alertdialog" aria-label="${safeTitle}, ${safeBody}" style="--accent:${accent}" data-duration="0">
      <div class="row">
        <div class="avatar-wrap">${markHtml(mark)}</div>
        <div class="text">
          <div class="title">${safeTitle}</div>
          <div class="body-text">${safeBody}</div>
        </div>
        <div class="call-btns">
          <button class="decline" type="button" title="Reddet" aria-label="Reddet" onclick="event.stopPropagation();window.__notifDecline && window.__notifDecline()">${PHONE_SVG}</button>
          <button class="accept" type="button" title="Kabul et" aria-label="Kabul et" onclick="event.stopPropagation();window.__notifAccept && window.__notifAccept()">${PHONE_SVG}</button>
        </div>
      </div>
    </div>`;
}

function cardInner({ title, body, isCall, duration, mark, accent, count = 1 }) {
  if (isCall) return callCardInner({ title, body, mark, accent });
  const safeTitle = escapeHtml(title || 'Descall');
  const safeBody = escapeHtml(body || '');
  const countText = Number(count) > 1 ? String(Math.min(99, Number(count))) : '';
  return `
    <div class="card" role="status" style="--accent:${accent}" data-duration="${Number(duration) || 0}" onclick="window.__notifClick && window.__notifClick()">
      <div class="row">
        ${markHtml(mark)}
        <div class="text">
          <div class="title"><span class="title-text">${safeTitle}</span><span class="count">${countText}</span></div>
          <div class="body-text">${safeBody}</div>
        </div>
        <button class="close-btn" type="button" onclick="event.stopPropagation();window.__notifClose && window.__notifClose()" aria-label="Kapat" title="Kapat">&#x2715;</button>
      </div>
      <div class="progress" aria-hidden="true"><i></i></div>
    </div>`;
}

function motionScript() {
  return `
    <script>
      (function () {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const omega = (2 * Math.PI) / 0.34;
        function springIn(el) {
          if (reduce) {
            el.style.opacity = '1';
            el.style.transform = 'none';
            el.style.filter = 'none';
            return;
          }
          let x = 36;
          let velocity = 0;
          let opacity = 0;
          let last = performance.now();
          const step = (now) => {
            const dt = Math.min(0.032, (now - last) / 1000);
            last = now;
            const accel = -(omega * omega) * (x - 0) - (2 * omega) * velocity;
            velocity += accel * dt;
            x += velocity * dt;
            opacity = Math.min(1, opacity + dt / 0.2);
            const scale = 0.96 + 0.04 * Math.min(1, opacity);
            el.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0) scale(' + scale.toFixed(4) + ')';
            el.style.opacity = opacity.toFixed(3);
            if (Math.abs(x) > 0.4 || Math.abs(velocity) > 6) requestAnimationFrame(step);
            else {
              el.style.transform = 'translate3d(0,0,0)';
              el.style.opacity = '1';
              el.style.filter = 'none';
            }
          };
          requestAnimationFrame(step);
        }
        // Exit: slide back toward the screen edge while fading (the way it
        // came in), critically damped, ~220 ms. Reduced motion: plain fade.
        function fadeOut(el, done) {
          if (reduce) {
            el.style.transition = 'opacity 160ms ease';
            el.style.opacity = '0';
            setTimeout(done, 160);
            return;
          }
          // Only the card fades and scales. No CSS filter, and the
          // backdrop-filter is dropped first: in Chromium, opacity/filter on
          // a backdrop-filter element inside a transparent window composites
          // a dark box much larger than the card (2.13.6 toast exit bug).
          el.classList.add('leaving');
          el.style.filter = 'none';
          el.style.transition = 'opacity 200ms cubic-bezier(0.4,0,1,1), transform 220ms cubic-bezier(0.4,0,1,1)';
          el.style.opacity = '0';
          el.style.transform = 'translate3d(28px,0,0) scale(0.96)';
          setTimeout(done, 220);
        }
        const cards = Array.from(document.querySelectorAll('.card'));
        let leaving = false;
        cards.forEach((card) => {
          springIn(card);
          const duration = Number(card.getAttribute('data-duration')) || 0;
          const bar = card.querySelector('.progress > i');
          if (!bar) return;
          if (!(duration > 0)) { bar.parentElement.style.display = 'none'; return; }
          let remaining = duration;
          // Grouped update (same chat): new text, count chip, timer restarts.
          window.notifAPI?.onUpdate?.((next) => {
            if (leaving || !next) return;
            const t = card.querySelector('.title-text');
            const b = card.querySelector('.body-text');
            const c = card.querySelector('.count');
            if (t && typeof next.title === 'string') t.textContent = next.title;
            if (b && typeof next.body === 'string') b.textContent = next.body;
            if (c) c.textContent = Number(next.count) > 1 ? String(Math.min(99, Number(next.count))) : '';
            remaining = duration;
            last = performance.now();
            if (!reduce && card.animate) {
              card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.015)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(0.2,0.8,0.2,1)' });
            }
          });
          let running = true;
          let last = performance.now();
          const tick = (now) => {
            if (leaving) return;
            if (running) {
              remaining -= now - last;
              if (remaining <= 0) {
                remaining = 0;
                bar.style.transform = 'scaleX(0)';
                beginDismiss('timeout');
                return;
              }
              bar.style.transform = 'scaleX(' + (remaining / duration).toFixed(4) + ')';
            }
            last = now;
            requestAnimationFrame(tick);
          };
          card.addEventListener('mouseenter', () => {
            running = false;
            window.notifAPI?.pause();
          });
          card.addEventListener('mouseleave', () => {
            if (leaving) return;
            running = true;
            last = performance.now();
            window.notifAPI?.resume(remaining);
          });
          requestAnimationFrame(tick);
        });
        function beginDismiss(action) {
          if (leaving) return;
          leaving = true;
          const card = document.querySelector('.card');
          const finish = () => {
            if (action === 'click') window.notifAPI?.click();
            else if (action === 'accept') window.notifAPI?.accept();
            else if (action === 'decline') window.notifAPI?.decline();
            else window.notifAPI?.close();
          };
          if (!card) { finish(); return; }
          fadeOut(card, finish);
        }
        window.__notifClick = () => beginDismiss('click');
        window.__notifClose = () => beginDismiss('close');
        window.__notifAccept = () => beginDismiss('accept');
        window.__notifDecline = () => beginDismiss('decline');
      })();
    <\/script>`;
}

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
} = {}) {
  const isCall = type === 'call';
  const accent = ACCENT[type] || ACCENT.default;
  const mark = resolveMark({ avatarUrl, appIcon, title, from });
  const liveDuration = isCall ? 0 : duration;
  const inner = cardInner({
    title,
    body,
    isCall,
    duration: liveDuration,
    mark,
    accent,
    count,
  });
  const shell = preview ? inner : `<div class="stage">${inner}</div>`;
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${notificationCss()}</style></head>
    <body class="${preview ? 'preview' : ''}">${shell}${motionScript()}</body></html>`;
}

function buildNotificationGallery(items) {
  const cards = items.map((item) => {
    const type = item.type || 'default';
    const accent = ACCENT[type] || ACCENT.default;
    const mark = resolveMark(item);
    const height = item.height || cardHeightFor(type);
    return `<div class="slot" style="width:${NOTIF_WIDTH}px;height:${height}px">${cardInner({
      title: item.title,
      body: item.body,
      isCall: type === 'call',
      duration: type === 'call' ? 0 : (item.duration ?? 60000),
      mark,
      accent,
    })}</div>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${notificationCss()}
    body.preview .slot { width: ${NOTIF_WIDTH}px; flex: none; }
    body.preview .slot .card { width: 100%; height: 100%; }
  </style></head><body class="preview">${cards}${motionScript()}</body></html>`;
}

module.exports = {
  NOTIF_WIDTH,
  NOTIF_HEIGHT,
  NOTIF_HEIGHT_CALL,
  MAX_VISIBLE,
  SHADOW_PAD,
  ACCENT,
  appIconSrc,
  initialOf,
  resolveMark,
  cardHeightFor,
  buildNotificationHtml,
  buildNotificationGallery,
};
