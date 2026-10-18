'use strict';

/**
 * Markup for the Electron always-on-top voice overlay (2.11.8).
 *
 * Liquid Glass polish: a heavy frosted card (tinted, near-opaque base, since a
 * transparent window cannot blur the desktop, so whatever is behind it never
 * shows through), a thin specular edge, a soft shadow, avatar + name +
 * status/duration, and three equal glass buttons with clear on/off states.
 * The tint follows the equipped theme through --ov-brand (sent by the
 * renderer as "r, g, b"). No electron imports so selftests can load it.
 */

const CARD_W = 280;
const CARD_H = 104;
const PAD = 14; // room for the soft shadow inside the transparent window
const OVERLAY_WIDTH = CARD_W + PAD * 2;
const OVERLAY_HEIGHT = CARD_H + PAD * 2 + 4;

const svg = (body) => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
  mic: svg('<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>'),
  micOff: svg('<line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/>'),
  headphones: svg('<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>'),
  headphonesOff: svg('<path d="M21 14h-1.343"/><path d="M9.128 3.47A9 9 0 0 1 21 12v3.343"/><path d="m2 2 20 20"/><path d="M20.414 20.414A2 2 0 0 1 19 21h-1a2 2 0 0 1-2-2v-3"/><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 2.636-6.364"/>'),
  phoneOff: svg('<path d="M10.1 13.9a14 14 0 0 0 3.732 2.668 1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 18 18 0 0 1-12.728-5.272"/><path d="M22 2 2 22"/><path d="M4.76 13.582A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 .244.473"/>'),
  users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  volume: svg('<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>'),
};

const STRINGS = {
  tr: {
    connected: 'Bağlı', calling: 'Aranıyor…', group: 'Grup araması', server: 'Ses kanalı', offline: 'Bağlantı yok',
    mute: 'Mikrofonu kapat', unmute: 'Mikrofonu aç', deafen: 'Sağırlaştır', undeafen: 'Sağırlaştırmayı kapat',
    leave: 'Ayrıl', end: 'Aramayı bitir',
  },
  en: {
    connected: 'Connected', calling: 'Calling…', group: 'Group call', server: 'Voice channel', offline: 'Disconnected',
    mute: 'Mute', unmute: 'Unmute', deafen: 'Deafen', undeafen: 'Undeafen',
    leave: 'Leave', end: 'End call',
  },
};

const CSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body {
    width:100%; height:100%; overflow:hidden; background:transparent;
    font-family:"Inter","Segoe UI Variable Text","Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,sans-serif;
    -webkit-font-smoothing:antialiased; user-select:none; -webkit-user-select:none;
  }
  body { padding:${PAD}px; }
  :root { --ov-brand: 92, 124, 250; }
  .card {
    position:relative; width:${CARD_W}px; height:${CARD_H}px; border-radius:22px; padding:12px;
    display:flex; flex-direction:column; gap:10px; overflow:hidden; isolation:isolate;
    color:#f4f5f8;
    /* Heavy frosted glass: theme tint over a near-opaque base (nothing behind reads through). */
    background:
      linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.025) 55%, rgba(255,255,255,0)),
      radial-gradient(120% 140% at 0% 0%, rgba(var(--ov-brand), .26), rgba(var(--ov-brand), .07) 55%, rgba(var(--ov-brand), 0) 80%),
      rgba(22, 24, 34, .975);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.20),
      inset 0 0 0 .5px rgba(255,255,255,.12),
      inset 0 -1px 0 rgba(0,0,0,.25),
      0 10px 22px -10px rgba(0,0,0,.70),
      0 2px 6px rgba(0,0,0,.30);
    -webkit-app-region:drag; cursor:default;
    animation:ov-in .26s cubic-bezier(.2,.8,.2,1) both;
  }
  /* specular sheen along the top-left edge */
  .card::before {
    content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none; z-index:-1;
    background:radial-gradient(90% 60% at 18% -20%, rgba(255,255,255,.16), rgba(255,255,255,0) 70%);
  }
  @keyframes ov-in { from { opacity:0; transform:scale(.97); } to { opacity:1; transform:none; } }
  .head { display:flex; align-items:center; gap:10px; min-width:0; height:34px; }
  .av {
    position:relative; flex:0 0 34px; width:34px; height:34px; border-radius:50%;
    display:grid; place-items:center; font-size:14px; font-weight:700; color:#fff;
    background:linear-gradient(160deg, rgba(var(--ov-brand), 1), rgba(var(--ov-brand), .55));
    box-shadow:inset 0 0 0 .5px rgba(255,255,255,.22), 0 1px 3px rgba(0,0,0,.35);
  }
  .av img { width:100%; height:100%; border-radius:50%; object-fit:cover; display:block; }
  .av img[hidden] { display:none; }
  .av .dot {
    position:absolute; right:-1px; bottom:-1px; width:11px; height:11px; border-radius:50%;
    background:#8a93a3; box-shadow:0 0 0 2px rgba(22,24,34,1);
  }
  .card.is-live .av .dot { background:#30d158; }
  .card.is-pending .av .dot { background:#ffd60a; }
  .txt { display:flex; flex-direction:column; min-width:0; flex:1; }
  .title { font-size:13.5px; font-weight:650; letter-spacing:-.005em; line-height:17px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .status { font-size:11.5px; font-weight:500; line-height:15px; color:rgba(235,238,245,.72); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-variant-numeric:tabular-nums; }
  .actions { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; -webkit-app-region:no-drag; }
  .btn {
    -webkit-app-region:no-drag; height:36px; border:none; border-radius:12px; cursor:pointer;
    display:grid; place-items:center; color:#eef0f5; font:inherit;
    background:linear-gradient(180deg, rgba(255,255,255,.11), rgba(255,255,255,.06));
    box-shadow:inset 0 1px 0 rgba(255,255,255,.12), inset 0 0 0 .5px rgba(255,255,255,.09);
    transition:transform .09s ease-out, background-color .12s, background .12s, color .12s, box-shadow .12s;
  }
  .btn:hover { background:linear-gradient(180deg, rgba(255,255,255,.17), rgba(255,255,255,.10)); }
  .btn:active { transform:scale(.96); transition-duration:.04s; }
  .btn:focus-visible { outline:none; box-shadow:0 0 0 2px rgba(var(--ov-brand), .95), inset 0 0 0 .5px rgba(255,255,255,.2); }
  .btn.is-off { color:#ff8a86; background:linear-gradient(180deg, rgba(255,69,58,.22), rgba(255,69,58,.14)); box-shadow:inset 0 1px 0 rgba(255,160,150,.16), inset 0 0 0 .5px rgba(255,105,97,.35); }
  .btn.is-off:hover { background:linear-gradient(180deg, rgba(255,69,58,.30), rgba(255,69,58,.20)); }
  .btn.leave { color:#ffb1ad; background:linear-gradient(180deg, rgba(255,69,58,.40), rgba(255,59,48,.28)); box-shadow:inset 0 1px 0 rgba(255,170,160,.20), inset 0 0 0 .5px rgba(255,105,97,.40); }
  .btn.leave:hover { color:#fff; background:linear-gradient(180deg, rgba(255,69,58,.92), rgba(230,50,42,.88)); }
  @media (prefers-reduced-motion: reduce) {
    .card { animation:none; }
    .btn, .btn:active { transition:none; transform:none; }
  }
  @media (prefers-reduced-transparency: reduce) {
    .card { background:rgb(24, 26, 36); }
  }
  @media (prefers-contrast: more) {
    .card { box-shadow:inset 0 0 0 1px rgba(255,255,255,.40), 0 10px 22px -10px rgba(0,0,0,.7); }
    .status { color:rgba(245,247,250,.92); }
    .btn { box-shadow:inset 0 0 0 1px rgba(255,255,255,.35); }
  }
`;

const SCRIPT = `
  (function () {
    var ICONS = ${JSON.stringify(ICONS)};
    var STRINGS = ${JSON.stringify(STRINGS)};
    var $ = function (id) { return document.getElementById(id); };
    var card = $('card'), titleEl = $('title'), statusEl = $('status'), avInit = $('avInit'), avImg = $('avImg');
    var muteBtn = $('muteBtn'), deafenBtn = $('deafenBtn'), leaveBtn = $('leaveBtn');
    var state = { title: '', muted: false, deafened: false, connected: false, pending: false, kind: 'dm', since: 0, lang: 'tr', avatarUrl: '', brandRgb: '' };
    var timer = null;
    function L() { return STRINGS[state.lang] || STRINGS.tr; }
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function fmt(ms) {
      var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s % 60);
    }
    function statusText() {
      var l = L();
      if (!state.connected) return l.offline;
      if (state.pending) return l.calling;
      var label = state.kind === 'group' ? l.group : state.kind === 'server' ? l.server : l.connected;
      return state.since ? label + ' · ' + fmt(Date.now() - state.since) : label;
    }
    function tick() { statusEl.textContent = statusText(); }
    function setBtn(btn, off, onIcon, offIcon, onLabel, offLabel) {
      btn.classList.toggle('is-off', off);
      btn.setAttribute('aria-pressed', off ? 'true' : 'false');
      btn.innerHTML = off ? offIcon : onIcon;
      var label = off ? offLabel : onLabel;
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
    function render() {
      var l = L();
      document.documentElement.lang = state.lang;
      titleEl.textContent = state.title || 'Descall';
      titleEl.title = state.title || 'Descall';
      card.classList.toggle('is-live', state.connected && !state.pending);
      card.classList.toggle('is-pending', state.connected && state.pending);
      if (/^\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*$/.test(state.brandRgb || '')) {
        document.documentElement.style.setProperty('--ov-brand', state.brandRgb);
      }
      var url = String(state.avatarUrl || '');
      var okUrl = state.kind === 'dm' && /^(https:\\/\\/|data:image\\/)/i.test(url);
      if (okUrl) { if (avImg.getAttribute('src') !== url) avImg.src = url; avImg.hidden = false; avInit.textContent = ''; }
      else {
        avImg.hidden = true; avImg.removeAttribute('src');
        if (state.kind === 'dm') avInit.textContent = (state.title || 'D').trim().charAt(0).toUpperCase();
        else avInit.innerHTML = state.kind === 'server' ? ICONS.volume : ICONS.users;
      }
      setBtn(muteBtn, !!state.muted, ICONS.mic, ICONS.micOff, l.mute, l.unmute);
      setBtn(deafenBtn, !!state.deafened, ICONS.headphones, ICONS.headphonesOff, l.deafen, l.undeafen);
      leaveBtn.innerHTML = ICONS.phoneOff;
      var leaveLabel = state.kind === 'dm' ? l.end : l.leave;
      leaveBtn.setAttribute('aria-label', leaveLabel); leaveBtn.title = leaveLabel;
      tick();
      if (state.connected && !state.pending && state.since) { if (!timer) timer = setInterval(tick, 1000); }
      else if (timer) { clearInterval(timer); timer = null; }
    }
    avImg.onerror = function () { state.avatarUrl = ''; render(); };
    window.__overlayUpdate = function (payload) {
      payload = payload || {};
      ['title', 'kind', 'lang', 'avatarUrl', 'brandRgb'].forEach(function (k) { if (typeof payload[k] === 'string') state[k] = payload[k]; });
      ['muted', 'deafened', 'connected', 'pending'].forEach(function (k) { if (typeof payload[k] === 'boolean') state[k] = payload[k]; });
      if (typeof payload.since === 'number') state.since = payload.since;
      if (state.lang !== 'en') state.lang = 'tr';
      render();
    };
    window.__overlayState = function () { return state; };
    muteBtn.onclick = function () { window.overlayAPI && window.overlayAPI.action('mute'); };
    deafenBtn.onclick = function () { window.overlayAPI && window.overlayAPI.action('deafen'); };
    leaveBtn.onclick = function () { window.overlayAPI && window.overlayAPI.action('leave'); };
    render();
  })();
`;

function buildOverlayHtml() {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    <div class="card" id="card">
      <div class="head">
        <span class="av"><img id="avImg" alt="" hidden><span id="avInit"></span><span class="dot"></span></span>
        <span class="txt"><span class="title" id="title">Descall</span><span class="status" id="status"></span></span>
      </div>
      <div class="actions">
        <button class="btn" id="muteBtn" type="button"></button>
        <button class="btn" id="deafenBtn" type="button"></button>
        <button class="btn leave" id="leaveBtn" type="button"></button>
      </div>
    </div>
    <script>${SCRIPT}<\/script>
  </body></html>`;
}

module.exports = { buildOverlayHtml, OVERLAY_WIDTH, OVERLAY_HEIGHT, STRINGS };
