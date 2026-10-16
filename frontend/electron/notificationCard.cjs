'use strict';

const fs = require('fs');
const path = require('path');

const NOTIF_WIDTH = 360;
const NOTIF_HEIGHT = 116;
const NOTIF_HEIGHT_CALL = 168;
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
      font-family: -apple-system, "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
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
      padding: 14px 14px 16px;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.20), rgba(255, 255, 255, 0.06)),
        rgba(16, 18, 28, 0.52);
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
      will-change: transform, opacity, filter;
    }
    body.preview .card {
      width: ${NOTIF_WIDTH}px;
      flex: none;
    }
    .card:hover {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0.08)),
        rgba(20, 22, 34, 0.58);
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
    .actions { display: flex; gap: 8px; margin-top: 10px; }
    .actions button {
      flex: 1;
      height: 30px;
      border: none;
      border-radius: 999px;
      color: white;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: -0.01em;
      cursor: pointer;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.32);
    }
    .accept { background: rgba(48, 209, 88, 0.92); }
    .decline { background: rgba(255, 69, 58, 0.90); }
    .progress {
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: 8px;
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
    }
  `;
}

function cardInner({ title, body, isCall, duration, mark, accent }) {
  const safeTitle = escapeHtml(title || 'Descall');
  const safeBody = escapeHtml(body || '');
  const actions = isCall ? `
    <div class="actions">
      <button class="accept" type="button" onclick="event.stopPropagation();window.__notifAccept && window.__notifAccept()">Accept</button>
      <button class="decline" type="button" onclick="event.stopPropagation();window.__notifDecline && window.__notifDecline()">Decline</button>
    </div>` : '';
  const progress = !isCall
    ? `<div class="progress" aria-hidden="true"><i></i></div>`
    : '';
  return `
    <div class="card" style="--accent:${accent}" data-duration="${Number(duration) || 0}">
      <div class="row">
        ${markHtml(mark)}
        <div class="text">
          <div class="title">${safeTitle}</div>
          <div class="body-text">${safeBody}</div>
        </div>
        <button class="close-btn" type="button" onclick="event.stopPropagation();window.__notifClose && window.__notifClose()" aria-label="Close">&#x2715;</button>
      </div>
      ${actions}
      ${progress}
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
            const blur = Math.max(0, (x / 36) * 8);
            el.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
            el.style.opacity = opacity.toFixed(3);
            el.style.filter = blur > 0.3 ? 'blur(' + blur.toFixed(2) + 'px)' : 'none';
            if (Math.abs(x) > 0.4 || Math.abs(velocity) > 6) requestAnimationFrame(step);
            else {
              el.style.transform = 'translate3d(0,0,0)';
              el.style.opacity = '1';
              el.style.filter = 'none';
            }
          };
          requestAnimationFrame(step);
        }
        function fadeOut(el, done) {
          el.style.transition = 'opacity 200ms ease, filter 200ms ease';
          el.style.opacity = '0';
          el.style.filter = reduce ? 'none' : 'blur(8px)';
          setTimeout(done, 200);
        }
        const cards = Array.from(document.querySelectorAll('.card'));
        let leaving = false;
        cards.forEach((card) => {
          springIn(card);
          const duration = Number(card.getAttribute('data-duration')) || 0;
          const bar = card.querySelector('.progress > i');
          if (!(duration > 0) || !bar) return;
          let remaining = duration;
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
} = {}) {
  const isCall = type === 'call';
  const accent = ACCENT[type] || ACCENT.default;
  const mark = resolveMark({ avatarUrl, appIcon, title, from });
  const height = cardHeightFor(type);
  const liveDuration = isCall ? 0 : duration;
  const inner = cardInner({
    title,
    body,
    isCall,
    duration: liveDuration,
    mark,
    accent,
  });
  const shell = preview ? inner : `<div class="stage">${inner}</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${notificationCss()}</style></head>
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
  SHADOW_PAD,
  ACCENT,
  appIconSrc,
  initialOf,
  resolveMark,
  cardHeightFor,
  buildNotificationHtml,
  buildNotificationGallery,
};
