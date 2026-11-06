/* Descall+ category-view drafts A-E, rendered inside the real app's settings window.
 * capture.cjs opens Ayarlar > Descall+, clicks a category tile, injects this file and calls
 * window.__dpcDraft(id, cat[, openKey]). Everything after the real back link (.pp-back) is
 * replaced; the settings window, menu, fonts, tokens and the app's own classes (us-card,
 * us-toggle, us-btn, pp-ico, pp-pill, pp-cat-head) are reused.
 * Static mockup with light wiring: switches, pickers, sliders and card expansion update the
 * local state and the live previews, nothing is saved. Every feature of the category and
 * every setting of its panel (frontend/src/premium/settings/<key>.jsx) is present; each
 * control carries data-s="<feature>.<setting>" so capture.cjs (CHECK=1) can compare it with
 * checklist.json. */
(function () {
  /* ---------------------------------------------------------------- icons */
  const I = {
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    micOff: '<path d="M4 4l16 16"/><path d="M9 9v2a3 3 0 0 0 5 2.2M15 10V6a3 3 0 0 0-5.8-1"/><path d="M5.5 11a6.5 6.5 0 0 0 10.6 5M18.5 11a6.4 6.4 0 0 1-.4 2.2M12 17.5V21"/>',
    head: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="5" height="7" rx="2"/><rect x="16" y="14" width="5" height="7" rx="2"/>',
    phone: '<path d="M3.5 13.5c4.7-4 12.3-4 17 0l-1.8 2.6a1.4 1.4 0 0 1-1.8.4l-2.3-1.2a1.4 1.4 0 0 1-.7-1.3v-1.3a12 12 0 0 0-4.8 0V14a1.4 1.4 0 0 1-.7 1.3l-2.3 1.2a1.4 1.4 0 0 1-1.8-.4z"/>',
    card: '<rect x="3" y="8" width="18" height="11" rx="3"/><circle cx="8" cy="13.5" r="2"/><path d="M12 12.5h5M12 15.5h3"/>',
    pin: '<path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 15v6"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    restore: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
    menu: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 12h8M8 15h5"/>',
    bar: '<rect x="2.5" y="15" width="19" height="5" rx="1.5"/><rect x="6" y="5" width="9" height="7" rx="1.5"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M9 3v18M9 12h12"/>',
    magnet: '<path d="M5 4h4v8a3 3 0 0 0 6 0V4h4v8a7 7 0 0 1-14 0z"/><path d="M5 8h4M15 8h4"/>',
    edge: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/><path d="M11 10l-2 2 2 2"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    pip: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><rect x="12" y="11" width="7" height="6" rx="1.2"/>',
    wins: '<rect x="3" y="7" width="13" height="12" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3"/>',
    gate: '<path d="M3 12h4l2-6 3 12 3-9 2 3h4"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    ear: '<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0"/><path d="M10 9a2 2 0 0 1 4 0"/>',
    activity: '<path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2M1 11v2"/>',
    shuffle: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    route: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M8.5 6h2a4 4 0 0 1 4 4v0M8.5 18h2a4 4 0 0 0 4-4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    cast: '<path d="M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><path d="M3 12a8 8 0 0 1 8 8M3 16a4 4 0 0 1 4 4M3 20h.01"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    up: '<path d="M18 15l-6-6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z"/>',
    cursor: '<path d="M5 3l14 7-6 2-2 6z"/>',
    speaker: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><circle cx="12" cy="14" r="3.5"/><path d="M12 7h.01"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/>',
    plug: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    vol: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
    volOff: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    drag: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><path d="M7.5 7.5h.01"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  };
  const svg = (n, s = 16, sw = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  /* ------------------------------------------------- features (Turkish copy from the app) */
  const CAT = {
    windows: {
      name: 'Pencereler', desc: 'Mini mod, üstte kalma, ayrı pencereler', color: 'blue', icon: 'monitor',
      keys: ['mini_mode', 'always_on_top', 'pip_call', 'multi_window', 'window_opacity', 'session_restore', 'tray_controls_plus', 'taskbar_plus', 'window_layouts', 'advanced_window_mgmt', 'screen_edge_actions', 'custom_layouts'],
      chapters: [
        ['Arama sırasında', 'Arama sürerken başka işlere geçtiğinde Descall seni bırakmaz.', ['mini_mode', 'pip_call', 'always_on_top', 'window_opacity']],
        ['Pencerelerin', 'Sohbetleri ayır, düzenleri kaydet, kenarları kullan.', ['multi_window', 'window_layouts', 'custom_layouts', 'advanced_window_mgmt', 'screen_edge_actions']],
        ['Açılış ve sistem', 'Descall bilgisayarına yerleşsin: tepsi, görev çubuğu, geri yükleme.', ['session_restore', 'tray_controls_plus', 'taskbar_plus']],
      ],
    },
    audio: {
      name: 'Ses', desc: 'Gürültü kapısı, mikrofon dinleme, cihaz profilleri', color: 'green', icon: 'mic',
      keys: ['noise_gate', 'mic_presets', 'mic_monitor', 'voice_activity_monitor', 'auto_device_switch', 'audio_routing', 'audio_device_profiles', 'stream_audio_control'],
      chapters: [
        ['Mikrofonun', 'Sesin karşı tarafa nasıl ulaşacağını sen belirle.', ['noise_gate', 'mic_presets', 'mic_monitor', 'voice_activity_monitor']],
        ['Cihazlar ve çıkışlar', 'Kulaklık takınca, masaya geçince, bildirim çalınca.', ['auto_device_switch', 'audio_routing', 'audio_device_profiles']],
        ['Yayın', 'Ekran paylaşımının sesi, iki yönde.', ['stream_audio_control']],
      ],
    },
  };
  const F = {
    mini_mode: { name: 'Mini mod', desc: 'Arama kontrollerin ve okunmamış sayınla küçük bir pencere.', icon: 'card' },
    always_on_top: { name: 'Her zaman üstte', desc: 'Seçtiğin Descall pencereleri diğer uygulamaların üstünde kalsın.', icon: 'pin' },
    pip_call: { name: 'Resim içinde resim arama', desc: 'Aramayı üstte kalan küçük bir pencerede izle.', icon: 'pip' },
    multi_window: { name: 'Ayrı pencereler', desc: 'Bir sohbeti ya da kanalı kendi penceresinde aç, en fazla 4.', icon: 'wins' },
    window_opacity: { name: 'Pencere saydamlığı', desc: 'Mini, arama ve ayrı pencereleri yarı saydam yap.', icon: 'drop' },
    session_restore: { name: 'Oturumu geri yükle', desc: 'Pencerelerini bıraktığın yerde yeniden aç.', icon: 'restore' },
    tray_controls_plus: { name: 'Tepsi kontrolleri', desc: 'Tepsi menüsünde arama kontrolleri, durum ve mini mod.', icon: 'menu' },
    taskbar_plus: { name: 'Görev çubuğu eklentileri', desc: 'Görev çubuğunda okunmamış rozeti ve arama düğmeleri.', icon: 'bar' },
    window_layouts: { name: 'Pencere düzenleri', desc: 'Adlandırılmış düzenleri kaydet ve aralarında geçiş yap.', icon: 'layout', ultra: true },
    advanced_window_mgmt: { name: 'Gelişmiş pencere yönetimi', desc: 'Yaslama, ekran farkındalığı ve kayıtlı pencere davranışı.', icon: 'magnet', ultra: true },
    screen_edge_actions: { name: 'Ekran kenarı işlemleri', desc: 'İmleç ekran kenarına değince kenar çubuğunu göster.', icon: 'edge', ultra: true },
    custom_layouts: { name: 'Özel düzenler', desc: 'Descall penceresini istediğin gibi düzenle.', icon: 'grid', ultra: true },
    noise_gate: { name: 'Gürültü kapısı', desc: 'Arka plan gürültüsü için kendi eşiğini ayarla.', icon: 'gate' },
    mic_presets: { name: 'Mikrofon ön ayarları', desc: 'Mikrofon ayarlarını kaydet ve değiştir.', icon: 'sliders' },
    mic_monitor: { name: 'Mikrofon dinleme', desc: 'Kendi mikrofonunu duy.', icon: 'ear' },
    voice_activity_monitor: { name: 'Ses etkinliği göstergesi', desc: 'Sesinin ne kadar yüksek olduğunu anlık gör.', icon: 'activity' },
    auto_device_switch: { name: 'Otomatik cihaz geçişi', desc: 'Yeni bir kulaklık takınca hemen ona geç.', icon: 'shuffle' },
    audio_routing: { name: 'Ses yönlendirme', desc: 'Aramaları ve sesleri farklı çıkışlara gönder.', icon: 'route' },
    audio_device_profiles: { name: 'Ses cihazı profilleri', desc: 'Her kulaklık için ayarları hatırla.', icon: 'head' },
    stream_audio_control: { name: 'Yayın sesi kontrolü', desc: 'Yayınının nasıl duyulacağını seç.', icon: 'cast', ultra: true },
  };

  /* ---------------------------------------------------------------- state */
  const S = {
    mini_mode: { enabled: true, corner: 'br', autoOnMinimize: true },
    always_on_top: { enabled: true, main: false, mini: true, call: true, sidebar: true, popout: false },
    pip_call: { enabled: true },
    multi_window: { enabled: true, open: 2 },
    window_opacity: { enabled: true, mini: 85, call: 100, sidebar: 70, popout: 90 },
    session_restore: { enabled: true, popouts: true, mini: true, bounds: true },
    tray_controls_plus: { enabled: false },
    taskbar_plus: { enabled: true, badge: true, buttons: true },
    window_layouts: { enabled: true },
    advanced_window_mgmt: { enabled: true, snap: true, keepVisible: true, mainMonitor: false },
    screen_edge_actions: { enabled: true, edge: 'right', delay: 250 },
    custom_layouts: { enabled: true, active: 'oyun' },
    noise_gate: { enabled: true, thresholdDb: -52, hysteresisDb: 10, holdMs: 120, testing: true },
    mic_presets: { enabled: true, gain: 100, active: 'voice' },
    mic_monitor: { enabled: true, volume: 80 },
    voice_activity_monitor: { enabled: true },
    auto_device_switch: { enabled: false, headsetFirst: true },
    audio_routing: { enabled: true, callOutput: 'hyperx', notificationOutput: 'realtek' },
    audio_device_profiles: { enabled: true, active: 'masa', newInput: 'yeti', newOutput: 'hyperx', newPreset: 'stream' },
    stream_audio_control: { enabled: true, sendVolume: 100, sendMuted: false, viewVolume: 80, viewMuted: false },
  };
  const CORNERS = { tl: 'Sol üst', tr: 'Sağ üst', bl: 'Sol alt', br: 'Sağ alt' };
  const DEVICES_IN = [['yeti', 'Blue Yeti', 'mic', true], ['hyperx-mic', 'HyperX Cloud II mikrofonu', 'head', true], ['laptop', 'Dizüstü mikrofonu', 'mic', false]];
  const DEVICES_OUT = [['', 'Sistem varsayılanı', 'monitor'], ['hyperx', 'HyperX Cloud II', 'head'], ['realtek', 'Realtek hoparlör', 'speaker']];
  const PRESETS = [
    ['voice', 'Konuşma', 'Gürültü engelleme · Yankı engelleme · Otomatik kazanç · 100%', [1, 1, 1]],
    ['noisy', 'Gürültülü oda', 'Güçlü gürültü engelleme · Yankı engelleme · Otomatik kazanç · 100%', [2, 1, 1]],
    ['studio', 'Stüdyo (işleme yok)', 'Gürültü engelleme yok · Yankı engelleme yok · Sabit kazanç · 100%', [0, 0, 0]],
    ['stream', 'Yayın', 'Gürültü engelleme · Yankı engelleme yok · Otomatik kazanç · 110%', [1, 0, 1]],
    ['gece', 'Gece', 'Güçlü gürültü engelleme · Yankı engelleme · Sabit kazanç · 85%', [2, 1, 0], true],
  ];

  /* ------------------------------------------------------- control helpers */
  const on = (k) => S[k].enabled;
  const tg = (k, p, val, ds) => `<button class="us-toggle${val ? ' active' : ''}" type="button" role="switch" aria-checked="${val}" data-tg="${k}.${p}" data-s="${ds || `${k}.${p}`}"><span class="us-toggle-knob"></span></button>`;
  const grp = (title, body, extra = '') => `<div class="dpc-g ${extra}"><div class="dpc-gt">${title}</div>${body}</div>`;
  const row = (label, desc, ctrl, icon) => `<div class="dpc-r${ctrl.includes('dpc-sl') ? ' dpc-st' : ''}">${icon ? `<span class="dpc-ri">${svg(icon, 15)}</span>` : ''}<div class="dpc-rc"><b>${label}</b>${desc ? `<small>${desc}</small>` : ''}</div><div class="dpc-rx">${ctrl}</div></div>`;
  const hint = (t, ds, tone = '') => `<p class="dpc-hint ${tone}" ${ds ? `data-s="${ds}"` : ''}>${svg(tone === 'warn' ? 'warn' : tone === 'ok' ? 'check' : 'info', 14)}<span>${t}</span></p>`;
  const btn = (label, kind = 'ghost', ds = '', icon = '') => `<button type="button" class="us-btn ${kind} sm" ${ds ? `data-s="${ds}"` : ''}>${icon ? svg(icon, 14) : ''}${label}</button>`;
  const field = (ph, ds) => `<span class="dpc-in" data-s="${ds}">${ph}</span>`;
  const seg = (k, p, opts, ds) => `<div class="dpc-seg" role="group" data-s="${ds || `${k}.${p}`}">${opts.map(([v, l, ic]) => `<button type="button" data-set="${k}.${p}" data-v="${v}" aria-pressed="${String(S[k][p]) === String(v)}">${ic ? svg(ic, 14) : ''}<span>${l}</span></button>`).join('')}</div>`;
  const slider = (k, p, min, max, step, fmt, ds) => {
    const v = S[k][p];
    const pct = ((v - min) / (max - min)) * 100;
    return `<span class="dpc-sl" data-s="${ds || `${k}.${p}`}"><input type="range" class="dpc-range" min="${min}" max="${max}" step="${step}" value="${v}" data-rg="${k}.${p}" style="--p:${pct}%"><output class="dpc-val tnum" data-out="${k}.${p}" data-fmt="${fmt}">${fmtv(fmt, v)}</output></span>`;
  };
  function fmtv(fmt, v) { return fmt === 'pct' ? `%${v}` : fmt === 'db' ? `${v} dB` : fmt === 'ms' ? `${v} ms` : String(v); }
  /* Choice tiles: visual buttons in place of a select. */
  const tiles = (k, p, opts, ds, cls = '') => `<div class="dpc-tiles ${cls}" role="radiogroup" data-s="${ds || `${k}.${p}`}">${opts.map(([v, l, ic, sub]) => `<button type="button" class="dpc-tile" data-set="${k}.${p}" data-v="${v}" aria-pressed="${S[k][p] === v}"><span class="ti">${svg(ic, 16)}</span><span class="tl">${l}</span>${sub ? `<span class="ts">${sub}</span>` : ''}<span class="tk">${svg('check', 12, 3)}</span></button>`).join('')}</div>`;
  /* Toggle tiles: one per window kind and similar on/off sets. */
  const ttiles = (k, list, cls = '') => `<div class="dpc-tt ${cls}">${list.map(([p, l, ic, sub]) => `<div class="dpc-ttile${S[k][p] ? ' on' : ''}" data-s="${k}.${p}"><span class="ti">${svg(ic, 16)}</span><span class="tc"><b>${l}</b>${sub ? `<small>${sub}</small>` : ''}</span>${tg(k, p, S[k][p], `${k}.${p}`).replace('data-s=', 'data-x=')}</div>`).join('')}</div>`;
  const cornerPicker = (k, p) => `<div class="dpc-corner" data-s="${k}.${p}" role="radiogroup" aria-label="Köşe">${Object.entries(CORNERS).map(([v, l]) => `<button type="button" class="c-${v}" data-set="${k}.${p}" data-v="${v}" aria-pressed="${S[k][p] === v}" title="${l}"><i></i></button>`).join('')}<span class="lbl">${CORNERS[S[k][p]]}</span></div>`;
  const edgePicker = (k, p) => `<div class="dpc-edgep" data-s="${k}.${p}" role="radiogroup">${[['left', 'Sol'], ['right', 'Sağ']].map(([v, l]) => `<button type="button" class="e-${v}" data-set="${k}.${p}" data-v="${v}" aria-pressed="${S[k][p] === v}"><i></i><span>${l}</span></button>`).join('')}</div>`;

  /* ------------------------------------------------------------ previews */
  const win = (cls, st, inner = '') => `<div class="dpc-w ${cls}" style="${st}"><i class="tb"></i>${inner}</div>`;
  const lines = (n = 4) => `<div class="ln">${Array.from({ length: n }, (_, i) => `<i style="width:${[78, 62, 88, 54, 70, 46][i % 6]}%"></i>`).join('')}</div>`;
  const dsWin = (st, extra = '') => win('ds', st, `<div class="ds-rail"><i></i><i></i><i></i></div><div class="ds-body">${lines(5)}</div>${extra}`);
  const other = (st) => win('other', st, lines(6));
  const lbl = (t, st, cls = '') => `<span class="dpc-lbl ${cls}" style="${st}">${t}</span>`;
  const scr = (inner, cls = '') => `<div class="dpc-scr ${cls}">${inner}<div class="dpc-dock"><i></i><i></i><i class="ds"></i><i></i></div></div>`;
  const av = (ch, c) => `<span class="dpc-av" style="background:${c}">${ch}</span>`;
  const callCard = (cls = '', st = '') => `<div class="dpc-call ${cls}" style="${st}">
      <div class="cc-top">${av('A', 'linear-gradient(135deg,#f08a24,#e8457a)')}<div class="cc-t"><b>Ayşe</b><small><span class="dot"></span>Oyun Gecesi</small></div></div>
      <div class="cc-btns"><span>${svg('mic', 13)}</span><span>${svg('head', 13)}</span><span class="red">${svg('phone', 13)}</span></div>
    </div>`;
  const WAVE = [-70, -66, -58, -40, -30, -26, -33, -45, -62, -71, -68, -50, -36, -28, -24, -29, -38, -55, -64, -72, -74, -69, -61, -48, -35, -31, -42, -57, -67, -73, -70, -66];

  const P = {
    mini_mode(s) {
      const pos = { tl: 'left:5%;top:7%', tr: 'right:5%;top:7%', bl: 'left:5%;bottom:17%', br: 'right:5%;bottom:17%' }[s.corner];
      const ghosts = Object.keys(CORNERS).filter((c) => c !== s.corner).map((c) => `<i class="dpc-ghost g-${c}"></i>`).join('');
      return scr(`${other('left:14%;top:12%;width:62%;height:62%')}${ghosts}${callCard('', pos)}
        ${s.autoOnMinimize ? lbl(`${svg('down', 11)}Descall küçültüldü`, 'left:4%;bottom:3.5%', 'on-dock') : ''}`, 'pv-mini');
    },
    always_on_top(s) {
      const z = (p) => (s[p] ? 'z-index:6' : 'z-index:1;opacity:.38;filter:saturate(.3)');
      const pinb = (p) => (s[p] ? `<span class="pinb">${svg('pin', 10, 2.4)}</span>` : '');
      return scr(`${dsWin(`left:5%;top:8%;width:46%;height:58%;${z('main')}`, pinb('main'))}
        ${other('left:24%;top:16%;width:52%;height:58%;z-index:3')}
        ${win('ds side', `right:0;top:0;width:13%;height:84%;${z('sidebar')}`, `<div class="sd">${av('A', '#e8457a')}${av('M', '#3e7bfa')}${av('K', '#30b458')}</div>${pinb('sidebar')}`)}
        ${win('ds call', `right:16%;top:8%;width:24%;height:26%;${z('call')}`, `<div class="vid"><i></i><i></i></div>${pinb('call')}`)}
        ${win('ds pop', `left:8%;bottom:15%;width:26%;height:30%;${z('popout')}`, `${lines(3)}${pinb('popout')}`)}
        <div style="position:absolute;right:16%;bottom:17%;width:30%;${z('mini')}">${callCard('mini')}${pinb('mini')}</div>
        ${lbl('Diğer uygulama', 'left:26%;top:66%;z-index:4')}`, 'pv-top');
    },
    pip_call() {
      return scr(`${other('left:6%;top:8%;width:70%;height:66%')}
        ${win('ds call big', 'right:5%;top:10%;width:38%;height:42%;z-index:5', `<div class="vid"><i>${av('A', '#e8457a')}</i><i>${av('D', '#3e7bfa')}</i></div><div class="vbar"><span>${svg('mic', 10)}</span><span>${svg('monitor', 10)}</span><span class="red">${svg('phone', 10)}</span></div>`)}
        ${lbl(`${svg('pin', 10)}Üstte`, 'right:6%;top:55%')}`, 'pv-pip');
    },
    multi_window(s) {
      const pops = [['#genel', 'Oyun Gecesi'], ['Ayşe', 'Özel mesaj'], ['#duyurular', 'Tasarım'], ['Mert', 'Özel mesaj']];
      const pos = ['left:44%;top:9%', 'left:56%;top:30%', 'left:46%;top:46%', 'left:60%;top:12%'];
      return scr(`${dsWin('left:4%;top:9%;width:44%;height:64%')}
        ${pops.map((p, i) => (i < s.open ? win('ds pop', `${pos[i]};width:34%;height:34%;z-index:${4 + i}`, `<div class="pt"><b>${p[0]}</b><small>${p[1]}</small></div>${lines(2)}`) : '')).join('')}
        ${lbl(`${s.open} / 4 ayrı pencere`, 'right:5%;bottom:17%')}`, 'pv-multi');
    },
    window_opacity(s) {
      const o = (p) => `opacity:${s[p] / 100}`;
      return scr(`<div class="dpc-stripes"></div>${other('left:4%;top:7%;width:60%;height:66%')}
        ${win('ds side', `right:0;top:0;width:13%;height:84%;${o('sidebar')}`, `<div class="sd">${av('A', '#e8457a')}${av('M', '#3e7bfa')}${av('K', '#30b458')}</div>`)}
        ${win('ds call', `left:42%;top:9%;width:30%;height:30%;${o('call')}`, '<div class="vid"><i></i><i></i></div>')}
        ${win('ds pop', `left:30%;top:44%;width:30%;height:32%;${o('popout')}`, `<div class="pt"><b>#genel</b></div>${lines(2)}`)}
        <div style="position:absolute;right:16%;bottom:17%;width:30%;${o('mini')}">${callCard('mini')}</div>
        ${lbl(`Mini %${s.mini}`, 'right:17%;bottom:4%')}${lbl(`Kenar %${s.sidebar}`, 'right:1%;top:3%')}${lbl(`Arama %${s.call}`, 'left:43%;top:2%')}${lbl(`Ayrı %${s.popout}`, 'left:31%;top:78%')}`, 'pv-op');
    },
    session_restore(s) {
      const side = (after) => `<div class="half">${after ? lbl('Yeniden açınca', 'left:6%;top:5%') : lbl('Kapatırken', 'left:6%;top:5%')}
        ${dsWin(after && !s.bounds ? 'left:20%;top:20%;width:60%;height:50%' : 'left:6%;top:22%;width:52%;height:48%')}
        ${!after || s.popouts ? win('ds pop', 'left:58%;top:26%;width:34%;height:30%', lines(2)) : ''}
        ${!after || s.mini ? `<div style="position:absolute;right:5%;bottom:10%;width:46%">${callCard('mini')}</div>` : ''}
        ${!after || s.mini ? win('ds side', 'right:0;top:0;width:8%;height:100%', '') : ''}</div>`;
      return `<div class="dpc-scr pv-restore"><div class="split">${side(false)}<span class="arr">${svg('chev', 18, 2.4)}</span>${side(true)}</div></div>`;
    },
    tray_controls_plus() {
      const it = (ic, t, x = '') => `<div class="mi">${svg(ic, 12)}<span>${t}</span>${x}</div>`;
      return scr(`${other('left:6%;top:8%;width:54%;height:60%')}
        <div class="dpc-traymenu">${it('mic', 'Sessize al')}${it('head', 'Sağırlaştır')}${it('user', 'Durum: Çevrimiçi', `<i class="ch">${svg('chev', 10)}</i>`)}<hr>${it('phone', 'Mini modu aç')}</div>
        <div class="dpc-tray"><i></i><i></i><i class="ds"></i><span class="clk">21:40</span></div>`, 'pv-tray');
    },
    taskbar_plus(s) {
      return scr(`${other('left:6%;top:8%;width:60%;height:48%')}
        <div class="dpc-thumb">${dsWin('position:relative;left:0;top:0;width:100%;height:62%')}
          ${s.buttons ? `<div class="tb-btns" data-s2><span>${svg('mic', 11)}</span><span>${svg('head', 11)}</span><span class="red">${svg('phone', 11)}</span></div>` : '<div class="tb-btns off"></div>'}</div>
        <div class="dpc-taskbar"><i></i><i></i><i class="ds">${s.badge ? '<b>3</b>' : ''}</i><i></i></div>`, 'pv-taskbar no-dock');
    },
    window_layouts() {
      return scr(`${dsWin('left:3%;top:6%;width:56%;height:70%')}${win('ds pop', 'left:61%;top:6%;width:35%;height:36%', `<div class="pt"><b>#strateji</b></div>${lines(2)}`)}
        ${win('ds call', 'left:61%;top:45%;width:35%;height:31%', '<div class="vid"><i></i><i></i></div>')}
        ${lbl(`${svg('layout', 10)}Oyun düzeni`, 'left:4%;bottom:4%')}`, 'pv-layout');
    },
    advanced_window_mgmt(s) {
      return `<div class="dpc-scr pv-adv"><div class="mons">
        <div class="mon a">${s.mainMonitor ? `<span class="star">${svg('star', 11, 2.2)}</span>` : ''}
          ${dsWin(s.snap ? 'left:0;top:0;width:50%;height:100%' : 'left:12%;top:14%;width:48%;height:66%')}${s.snap ? '<i class="snapg"></i>' : ''}
          ${lbl(s.mainMonitor ? 'Son kullanılan ekran' : 'Ekran 1', 'left:52%;bottom:6%')}</div>
        <div class="mon b ${s.keepVisible ? 'gone' : ''}">${s.keepVisible ? `<span class="back">${svg('restore', 14)}</span>${lbl('Çıkarıldı', 'left:10%;bottom:6%')}` : `${win('ds pop', 'left:20%;top:20%;width:56%;height:50%', lines(2))}${lbl('Ekran 2', 'left:10%;bottom:6%')}`}</div>
      </div></div>`;
    },
    screen_edge_actions(s) {
      const left = s.edge === 'left';
      return scr(`${other('left:14%;top:9%;width:70%;height:64%')}
        ${win('ds side', `${left ? 'left:0' : 'right:0'};top:0;width:20%;height:84%;z-index:5`, `<div class="sd">${av('A', '#e8457a')}${av('M', '#3e7bfa')}${av('K', '#30b458')}${av('E', '#9b5de5')}</div>`)}
        <span class="dpc-cursor" style="${left ? 'left:1%' : 'right:1%'};top:44%">${svg('cursor', 16, 1.6)}</span>
        <span class="dpc-edgeglow" style="${left ? 'left:0' : 'right:0'}"></span>
        ${lbl(`${svg('clock', 10)}${s.delay} ms`, `${left ? 'left:22%' : 'right:22%'};top:44%`)}`, 'pv-edge');
    },
    custom_layouts(s) {
      const w = s.active === 'oyun'
        ? [['left:3%;top:4%;width:46%;height:44%', 'Arkadaşlar'], ['left:51%;top:4%;width:46%;height:20%', 'Saat'], ['left:51%;top:26%;width:46%;height:22%', 'Müzik'], ['left:3%;top:52%;width:94%;height:42%', 'Ses kanalı']]
        : [['left:3%;top:4%;width:94%;height:28%', 'Takvim'], ['left:3%;top:36%;width:46%;height:58%', 'Notlar'], ['left:51%;top:36%;width:46%;height:58%', 'Mesajlar']];
      return scr(`<div class="dpc-w ds" style="left:8%;top:6%;width:84%;height:72%"><i class="tb"></i><div class="wg">${w.map(([st, t]) => `<div class="wgi" style="${st}"><span>${t}</span></div>`).join('')}</div></div>
        ${lbl(s.active === 'oyun' ? 'Oyun · Etkin' : 'Çalışma · Etkin', 'left:9%;bottom:4%')}`, 'pv-widgets');
    },
    /* audio */
    noise_gate(s) {
      const top = -10; const bot = -80;
      const y = (db) => ((top - db) / (top - bot)) * 100;
      const close = s.thresholdDb - s.hysteresisDb;
      const bars = WAVE.map((db, i) => `<i class="${db >= s.thresholdDb ? 'pass' : db >= close && i > 0 && WAVE[i - 1] >= s.thresholdDb ? 'hold' : ''}" style="height:${100 - y(db)}%"></i>`).join('');
      const holdW = Math.min(30, (s.holdMs / 1000) * 30);
      return `<div class="dpc-scr pv-gate"><div class="meter"><div class="bars">${bars}</div>
        <div class="band" style="top:${y(s.thresholdDb)}%;height:${y(close) - y(s.thresholdDb)}%"></div>
        <div class="th" style="top:${y(s.thresholdDb)}%"><span>Eşik ${s.thresholdDb} dB</span></div>
        <div class="hold" style="left:56%;width:${holdW}%"></div></div>
        <div class="lg"><span><i class="pass"></i>Gönderilir</span><span><i></i>Kesilir</span><span><i class="hold"></i>Pay ${s.hysteresisDb} dB</span><span><i class="hb"></i>Bekleme ${s.holdMs} ms</span></div></div>`;
    },
    mic_presets(s) {
      const p = PRESETS.find((x) => x[0] === s.active) || PRESETS[0];
      const ang = Math.min(1, s.gain / 200) * 270;
      const chain = [['Gürültü', p[3][0] ? (p[3][0] === 2 ? 'Güçlü' : 'Açık') : 'Kapalı', p[3][0]], ['Yankı', p[3][1] ? 'Açık' : 'Kapalı', p[3][1]], ['Kazanç', p[3][2] ? 'Otomatik' : 'Sabit', p[3][2]]];
      return `<div class="dpc-scr pv-presets"><div class="dial" style="--a:${ang}deg"><div class="in"><b class="tnum">%${s.gain}</b><small>Giriş kazancı</small></div></div>
        <div class="chain">${svg('mic', 14)}${chain.map(([a, b, v]) => `<span class="chip ${v ? 'on' : ''}"><small>${a}</small><b>${b}</b></span>`).join(`<i class="ar">${svg('chev', 12)}</i>`)}</div>
        ${lbl(p[1], 'left:6%;top:7%', 'strong')}</div>`;
    },
    mic_monitor(s) {
      const n = Math.round(s.volume / 20);
      return `<div class="dpc-scr pv-monitor"><div class="flow"><span class="node">${svg('mic', 20)}</span>
        <span class="wave">${Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}" style="height:${30 + i * 14}%"></i>`).join('')}</span>
        <span class="node">${svg('head', 20)}</span></div>${lbl(`Dinleme sesi %${s.volume}`, 'left:50%;bottom:9%;transform:translateX(-50%)')}</div>`;
    },
    voice_activity_monitor() {
      const ppl = [['A', 'Ayşe', '#e8457a', 82], ['M', 'Mert', '#3e7bfa', 34], ['D', 'Demirr', '#30b458', 58], ['K', 'Kaan', '#f08a24', 8]];
      return `<div class="dpc-scr pv-vam"><div class="ppl">${ppl.map(([c, n, col, l]) => `<div class="p ${l > 50 ? 'talk' : ''}">${av(c, col)}<b>${n}</b><span class="lv"><i style="width:${l}%"></i></span></div>`).join('')}</div></div>`;
    },
    auto_device_switch(s) {
      return `<div class="dpc-scr pv-auto"><div class="stack">${DEVICES_IN.map(([id, n, ic, live], i) => `<div class="d ${i === 0 ? 'act' : ''} ${live ? '' : 'off'}"><span class="n tnum">${i + 1}</span>${svg(ic, 14)}<b>${n}</b>${i === 0 ? '<em>Etkin</em>' : ''}</div>`).join('')}</div>
        ${s.headsetFirst ? `<div class="plug">${svg('plug', 14)}<span>Yeni kulaklık takılınca hemen ona geçer</span></div>` : ''}</div>`;
    },
    audio_routing(s) {
      const name = (id) => (DEVICES_OUT.find((d) => d[0] === id) || DEVICES_OUT[0])[1];
      return `<div class="dpc-scr pv-route"><svg class="wires" viewBox="0 0 100 60" preserveAspectRatio="none"><path d="M30 18 C 50 18, 50 ${s.callOutput === s.notificationOutput ? 30 : 18}, 70 ${s.callOutput === s.notificationOutput ? 30 : 18}"/><path class="b" d="M30 42 C 50 42, 50 ${s.callOutput === s.notificationOutput ? 30 : 42}, 70 ${s.callOutput === s.notificationOutput ? 30 : 42}"/></svg>
        <div class="src" style="top:20%">${svg('phone', 13)}<span>Görüşmeler</span></div><div class="src b" style="top:60%">${svg('bell', 13)}<span>Bildirim sesleri</span></div>
        ${s.callOutput === s.notificationOutput ? `<div class="dst" style="top:40%">${svg('head', 13)}<span>${name(s.callOutput)}</span></div>` : `<div class="dst" style="top:20%">${svg('head', 13)}<span>${name(s.callOutput)}</span></div><div class="dst b" style="top:60%">${svg('speaker', 13)}<span>${name(s.notificationOutput)}</span></div>`}</div>`;
    },
    audio_device_profiles(s) {
      const pr = [['masa', 'Masa', 'Blue Yeti', 'Realtek hoparlör', 'Konuşma'], ['oyun', 'Oyun', 'HyperX mikrofonu', 'HyperX Cloud II', 'Gürültülü oda']];
      return `<div class="dpc-scr pv-prof">${pr.map(([id, n, i, o, p]) => `<div class="pc ${s.active === id ? 'act' : ''}"><b>${n}</b><span>${svg('mic', 11)}${i}</span><span>${svg('head', 11)}${o}</span><span>${svg('sliders', 11)}${p}</span></div>`).join('')}</div>`;
    },
    stream_audio_control(s) {
      const fad = (lab, v, m) => `<div class="fd ${m ? 'muted' : ''}"><div class="tr"><i style="height:${m ? 0 : v / 2}%"></i><span class="knob" style="bottom:${m ? 0 : v / 2}%"></span></div><b class="tnum">${m ? 'Kapalı' : `%${v}`}</b><small>${lab}</small></div>`;
      return `<div class="dpc-scr pv-stream"><div class="mix">${fad('Senin paylaşımın', s.sendVolume, s.sendMuted)}${fad('Diğerlerininki', s.viewVolume, s.viewMuted)}</div>
        <div class="scrn">${svg('cast', 22, 1.6)}<span>Ekran paylaşımı</span></div></div>`;
    },
  };

  /* ------------------------------------------------- settings per feature */
  const G = {
    mini_mode: (k) => [
      grp('Konum', `${cornerPicker(k, 'corner')}<p class="dpc-note">Kart arama sırasında uygulamanın içinde yüzer. Sürükleyip bir köşeye bırakabilirsin; burada başlangıç köşesini seçersin.</p>`),
      grp('Davranış', `${row("Arama sırasında Descall'ı küçültünce mini modu aç", '', tg(k, 'autoOnMinimize', S[k].autoOnMinimize), 'down')}
        <div class="dpc-act">${btn('Mini modu aç', 'primary', `${k}.open`, 'play')}</div>`),
    ],
    always_on_top: (k) => [
      grp('Üstte kalan pencereler', `<p class="dpc-note" data-s="${k}.lead">Bu pencereler diğer uygulamaların üstünde kalsın.</p>${ttiles(k, [['main', 'Ana pencere', 'monitor'], ['mini', 'Mini pencere', 'phone'], ['call', 'Arama penceresi', 'pip'], ['sidebar', 'Masaüstü kenar çubuğu', 'sidebar'], ['popout', 'Ayrı pencereler', 'wins']], 'cols')}`),
    ],
    pip_call: (k) => [
      grp('Arama penceresi', `<p class="dpc-note">Arama, diğer uygulamaların üstünde duran küçük bir pencerede sürer. Görüntü ve arama düğmeleri içinde.</p><div class="dpc-act">${btn('Arama penceresini aç', 'primary', `${k}.open`, 'play')}</div>`),
    ],
    multi_window: (k) => [
      grp('Nasıl açılır', `<p class="dpc-note" data-s="${k}.how">Bir sohbeti kendi penceresinde açmak için sohbet başlığındaki <b>Ayrı pencerede aç</b> düğmesini kullan. En fazla 4 ayrı pencere açabilirsin.</p>`),
      grp('Açık pencereler', `<div class="dpc-slots" data-s="${k}.list">${[['#genel', 'Oyun Gecesi'], ['Ayşe', 'Özel mesaj'], ['', ''], ['', '']].map(([a, b], i) => (i < S[k].open ? `<div class="sl on">${svg('wins', 14)}<b>${a}</b><small>${b}</small></div>` : '<div class="sl">Boş</div>')).join('')}</div>
        <div class="dpc-r"><div class="dpc-rc"><small data-s="${k}.count">${S[k].open} ayrı pencere açık</small></div><div class="dpc-rx">${btn('Hepsini kapat', 'ghost', `${k}.closeAll`)}</div></div>`),
    ],
    window_opacity: (k) => [
      grp('Saydamlık', `<p class="dpc-note" data-s="${k}.lead">Küçük pencereleri yarı saydam yap.</p>
        ${row('Mini pencere', '', slider(k, 'mini', 30, 100, 5, 'pct'), 'phone')}
        ${row('Arama penceresi', '', slider(k, 'call', 30, 100, 5, 'pct'), 'pip')}
        ${row('Masaüstü kenar çubuğu', '', slider(k, 'sidebar', 30, 100, 5, 'pct'), 'sidebar')}
        ${row('Ayrı pencereler', '', slider(k, 'popout', 30, 100, 5, 'pct'), 'wins')}`),
    ],
    session_restore: (k) => [
      grp('Descall açılınca geri gelenler', ttiles(k, [['popouts', 'Ayrı pencereleri yeniden aç', 'wins'], ['mini', 'Mini modu ve kenar çubuğunu yeniden aç', 'phone'], ['bounds', 'Pencere konum ve boyutlarını hatırla', 'layout']])),
    ],
    tray_controls_plus: (k) => [
      grp('Tepsi menüsü', `<p class="dpc-note" data-s="${k}.lead">Tepsi simgesinden sessize al, sağırlaştır, durumunu seç ve mini modu aç.</p><div class="dpc-chips"><span>${svg('mic', 12)}Sessize al</span><span>${svg('head', 12)}Sağırlaştır</span><span>${svg('user', 12)}Durum</span><span>${svg('phone', 12)}Mini mod</span></div><p class="dpc-note dim">Ayarlanacak başka bir şey yok: özellik açıkken bu girişler tepsi menüsüne eklenir.</p>`),
    ],
    taskbar_plus: (k) => [
      grp('Görev çubuğu', ttiles(k, [['badge', 'Görev çubuğu simgesinde okunmamış sayısı', 'tag'], ['buttons', 'Görev çubuğu önizlemesinde arama düğmeleri', 'phone', 'Yalnızca Windows']])),
    ],
    window_layouts: (k) => [
      grp('Kayıtlı düzenler', `<div class="dpc-lays" data-s="${k}.list">${[['Oyun', 3, '2 Kas 2026', 'a'], ['Çalışma', 2, '28 Eki 2026', 'b']].map(([n, c, d, v]) => `<div class="lay"><div class="lt v-${v}"><i></i><i></i><i></i></div><div class="lc"><b>${n}</b><small>${c} pencere · ${d}</small></div>${btn('Uygula', 'primary', `${k}.apply`)}${btn('Sil', 'ghost', `${k}.delete`)}</div>`).join('')}</div>`),
      grp('Yeni düzen', `<div class="dpc-form">${field('Düzen adı', `${k}.name`)}${btn('Mevcut düzeni kaydet', 'ghost', `${k}.save`, 'plus')}</div>`),
    ],
    advanced_window_mgmt: (k) => [
      grp('Pencere davranışı', ttiles(k, [['snap', 'Pencereleri ekran kenarlarına yasla', 'magnet'], ['keepVisible', 'Bir ekran çıkarılınca pencereleri geri getir', 'restore'], ['mainMonitor', "Descall'ı en son kullandığım ekranda aç", 'star']])),
    ],
    screen_edge_actions: (k) => [
      grp('Kenar', `<p class="dpc-note" data-s="${k}.lead">Kenar çubuğunu göstermek için imleci bu kenara götür.</p>${edgePicker(k, 'edge')}
        ${hint('Masaüstü kenar çubuğu açık. Bu özellik onunla çalışır.', `${k}.needsSidebar`, 'ok')}`),
      grp('Gösterme gecikmesi', seg(k, 'delay', [[0, '0 ms'], [250, '250 ms'], [500, '500 ms'], [1000, '1000 ms']]) + `<div class="dpc-delay"><i style="width:${(S[k].delay / 1000) * 100}%"></i></div>`),
    ],
    custom_layouts: (k) => [
      grp('Düzenler', `<p class="dpc-note">Widget yerleşimini kaydet ve yerleşimler arasında geç. En fazla 8 düzen tutabilirsin.</p><div class="dpc-lays" data-s="${k}.list">${[['oyun', 'Oyun', 4, 'c'], ['calisma', 'Çalışma', 3, 'd']].map(([id, n, c, v]) => `<div class="lay"><div class="lt v-${v}"><i></i><i></i><i></i></div><div class="lc"><b>${n}</b><small>${c} widget</small></div>${S[k].active === id ? `<span class="pa-badge pa-badge-ok" data-s="${k}.active">Etkin</span>` : `<button type="button" class="us-btn primary sm" data-set="${k}.active" data-v="${id}" data-s="${k}.apply">Kullan</button>`}<button type="button" class="us-btn ghost sm dpc-ib" aria-label="Kaldır" data-s="${k}.remove">${svg('trash', 14)}</button></div>`).join('')}</div>`),
      grp('Yeni düzen', `<div class="dpc-form">${field('Düzen adı', `${k}.name`)}${btn("Mevcut widget'ları kaydet", 'primary', `${k}.save`, 'plus')}</div>`),
    ],
    /* audio */
    noise_gate: (k) => [
      grp('Eşik', `${row('Eşik', 'Normal konuş ve eşiği sesinin biraz altına ayarla.', slider(k, 'thresholdDb', -80, -10, 1, 'db'))}
        <div class="dpc-test" data-s="${k}.meter"><span class="pa-meter is-open"><span class="pa-meter-fill" style="transform:scaleX(.62)"></span><span class="pa-meter-mark" style="left:${((S[k].thresholdDb + 80) / 70) * 100}%"></span></span>
        <button type="button" class="us-btn ghost sm" data-s="${k}.test">${svg(S[k].testing ? 'x' : 'mic', 14)}${S[k].testing ? 'Denemeyi bitir' : 'Mikrofonu dene'}</button>${S[k].testing ? '<span class="pa-badge pa-badge-ok">Açık</span>' : ''}</div>`),
      grp('Kapanış', `${row('Eşiğin altında kapanma payı', 'Kelimelerin sessiz sonları kesilmez.', slider(k, 'hysteresisDb', 0, 30, 1, 'db'))}
        ${row('Bekleme', 'Konuşmayı bıraktıktan sonra kapının ne kadar açık kalacağı.', slider(k, 'holdMs', 0, 1000, 10, 'ms'))}`),
    ],
    mic_presets: (k) => [
      grp('Mikrofon', `${row('Giriş kazancı', 'Mikrofonun verdiğinden daha yüksek ya da alçak.', slider(k, 'gain', 0, 200, 5, 'pct'))}
        <div class="dpc-r" data-s="${k}.current"><div class="dpc-rc"><b>Şu anki ayarlar</b><small>Gürültü engelleme · Yankı engelleme · Otomatik kazanç · %${S[k].gain}</small></div></div>`),
      grp('Ön ayarlar', `<div class="dpc-presets" data-s="${k}.list">${PRESETS.map(([id, n, d, f, custom]) => `<div class="ps ${S[k].active === id ? 'on' : ''}"><div class="pi">${['gate', 'ear', 'sliders'].map((ic, j) => `<span class="${f[j] ? 'y' : ''}">${svg(ic, 11)}</span>`).join('')}</div><b>${n}</b><small>${d}</small>
          <div class="pa">${S[k].active === id ? '<span class="pa-badge pa-badge-ok">Etkin</span>' : `<button type="button" class="us-btn ghost sm" data-set="${k}.active" data-v="${id}" data-s="${k}.apply">Uygula</button>`}${custom ? `<button type="button" class="us-btn ghost sm dpc-danger" data-s="${k}.delete">Sil</button>` : ''}</div></div>`).join('')}</div>
        <div class="dpc-form">${field('Ön ayar adı', `${k}.name`)}${btn('Şu anki ayarları kaydet', 'primary', `${k}.save`, 'plus')}</div>`),
    ],
    mic_monitor: (k) => [
      grp('Kendini duy', `<p class="dpc-note">Görüşmelerde kendi mikrofonunu gürültü engellemeden sonraki haliyle duy.</p>${row('Dinleme sesi', '', slider(k, 'volume', 0, 100, 5, 'pct'), 'head')}${hint('Kulaklık kullan, yoksa diğerleri yankı duyabilir.', `${k}.headphones`, 'warn')}`),
    ],
    voice_activity_monitor: (k) => [
      grp('Ses etkinliği', `<p class="dpc-note" data-s="${k}.hint">Sesli kanallarda her katılımcının altında canlı bir seviye çubuğu.</p><p class="dpc-note dim">Ayarlanacak başka bir şey yok: açık olduğunda göstergeler sesli kanallarda görünür.</p>`),
    ],
    auto_device_switch: (k) => {
      const list = (items, ds) => `<div class="dpc-order" data-s="${k}.${ds}">${items.map(([id, n, ic, live], i) => `<div class="od"><span class="dh">${svg('drag', 14)}</span><span class="n tnum">${i + 1}</span>${svg(ic, 15)}<div class="oc"><b>${n}</b><small class="${live ? 'ok' : ''}">${live ? 'Bağlı' : 'Bağlı değil'}</small></div>
        <span class="mv" data-s="${k}.move"><button type="button" class="us-btn ghost sm dpc-ib" aria-label="Yukarı taşı" ${i === 0 ? 'disabled' : ''}>${svg('up', 13)}</button><button type="button" class="us-btn ghost sm dpc-ib" aria-label="Aşağı taşı" ${i === items.length - 1 ? 'disabled' : ''}>${svg('down', 13)}</button></span>
        <button type="button" class="us-btn ghost sm dpc-danger" data-s="${k}.remove">Kaldır</button></div>`).join('')}
        <button type="button" class="dpc-add" data-s="${k}.add">${svg('plus', 14)}Cihaz ekle</button></div>`;
      return [
        grp('Otomatik cihaz değiştirme', `<p class="dpc-note">Bir cihaz bağlanınca Descall listende en üstte olana geçer.</p>${row('Yeni kulaklıkları tercih et', 'Listede eşleşen yoksa bağlanan kulaklığa hemen geç.', tg(k, 'headsetFirst', S[k].headsetFirst), 'plug')}`),
        grp('Mikrofon sırası', list(DEVICES_IN, 'inputOrder')),
        grp('Hoparlör ve kulaklık sırası', list([['hyperx', 'HyperX Cloud II', 'head', true], ['realtek', 'Realtek hoparlör', 'speaker', true]], 'outputOrder')),
      ];
    },
    audio_routing: (k) => [
      grp('Görüşmeler', `<p class="dpc-note">Sesli kanallar ve görüşmeler.</p>${tiles(k, 'callOutput', DEVICES_OUT.map(([v, l, ic]) => [v, l, ic]))}`),
      grp('Bildirim sesleri', `<p class="dpc-note">Mesajlar, bahsetmeler ve zil sesleri.</p>${tiles(k, 'notificationOutput', DEVICES_OUT.map(([v, l, ic]) => [v, l, ic]))}<div class="dpc-act">${btn('Dene', 'ghost', `${k}.test`, 'play')}</div>`),
    ],
    audio_device_profiles: (k) => [
      grp('Cihaz profilleri', `<p class="dpc-note">Bir profil mikrofonu, çıkışı ve bir ön ayarı tek seferde değiştirir.</p><div class="dpc-lays" data-s="${k}.list">${[['masa', 'Masa', 'Blue Yeti · Realtek hoparlör · Konuşma'], ['oyun', 'Oyun', 'HyperX Cloud II mikrofonu · HyperX Cloud II · Gürültülü oda']].map(([id, n, d]) => `<div class="lay"><span class="pp-ico c-green sm">${svg('head', 14)}</span><div class="lc"><b>${n}</b><small>${d}</small></div>${S[k].active === id ? '<span class="pa-badge pa-badge-ok">Etkin</span>' : ''}<button type="button" class="us-btn ghost sm" data-set="${k}.active" data-v="${id}" data-s="${k}.apply">Uygula</button><button type="button" class="us-btn ghost sm dpc-danger" data-s="${k}.delete">Sil</button></div>`).join('')}</div>`),
      grp('Yeni profil', `<div class="dpc-form">${field('Profil adı, örneğin Masa ya da Oyun', `${k}.name`)}</div>
        <div class="dpc-pick"><small>Mikrofon</small>${tiles(k, 'newInput', [['', 'Şu anki kalsın', 'restore'], ['yeti', 'Blue Yeti', 'mic'], ['hyperx-mic', 'HyperX mikrofonu', 'head']], `${k}.input`, 'mini')}</div>
        <div class="dpc-pick"><small>Çıkış</small>${tiles(k, 'newOutput', [['', 'Şu anki kalsın', 'restore'], ['hyperx', 'HyperX Cloud II', 'head'], ['realtek', 'Realtek hoparlör', 'speaker']], `${k}.output`, 'mini')}</div>
        <div class="dpc-pick"><small>Ön ayar</small>${tiles(k, 'newPreset', [['', 'Ön ayar yok', 'x'], ['voice', 'Konuşma', 'sliders'], ['stream', 'Yayın', 'cast']], `${k}.preset`, 'mini')}</div>
        <div class="dpc-act">${btn('Oluştur', 'primary', `${k}.create`, 'plus')}</div>${hint('Masaüstü uygulamasında profili tepsi simgesinden de değiştirebilirsin.', `${k}.trayNote`)}`),
    ],
    stream_audio_control: (k) => [
      grp('Paylaşılan ses (sen)', `<p class="dpc-note">Ekran paylaşımındaki sesin, izleyen herkes için seviyesi.</p>${row('Paylaşılan ses seviyesi', '', slider(k, 'sendVolume', 0, 200, 5, 'pct'), 'vol')}${row('Paylaşılan sesi kapat', 'Görüntü devam eder.', tg(k, 'sendMuted', S[k].sendMuted), 'volOff')}`),
      grp('Paylaşılan ses (diğerleri)', `<p class="dpc-note">Başkalarının ekran paylaşımlarının sende ne kadar yüksek olacağı.</p>${row('Ses seviyesi', '', slider(k, 'viewVolume', 0, 200, 5, 'pct'), 'vol')}${row('Diğerlerinin paylaşılan sesini kapat', '', tg(k, 'viewMuted', S[k].viewMuted), 'volOff')}`),
      `<div data-s="${k}.note">${hint('Başlatacağın bir sonraki ekran paylaşımında geçerli olur. Diğerlerinin paylaşımları için ayar sesli kanallarda geçerlidir.')}</div>`,
    ],
  };

  /* Short "what is set" line for a closed card. */
  const SUM = {
    mini_mode: (s) => [CORNERS[s.corner], s.autoOnMinimize ? 'Küçültünce açılır' : 'Elle açılır'],
    always_on_top: (s) => [`${['main', 'mini', 'call', 'sidebar', 'popout'].filter((p) => s[p]).length} pencere üstte`],
    pip_call: () => ['Üstte kalan arama'],
    multi_window: (s) => [`${s.open} / 4 açık`],
    window_opacity: (s) => [`Mini %${s.mini}`, `Kenar %${s.sidebar}`],
    session_restore: (s) => [`${['popouts', 'mini', 'bounds'].filter((p) => s[p]).length} / 3 geri gelir`],
    tray_controls_plus: () => ['4 giriş'],
    taskbar_plus: (s) => [s.badge ? 'Rozet' : 'Rozet yok', s.buttons ? 'Arama düğmeleri' : ''].filter(Boolean),
    window_layouts: () => ['2 düzen'],
    advanced_window_mgmt: (s) => [`${['snap', 'keepVisible', 'mainMonitor'].filter((p) => s[p]).length} / 3 açık`],
    screen_edge_actions: (s) => [s.edge === 'left' ? 'Sol kenar' : 'Sağ kenar', `${s.delay} ms`],
    custom_layouts: (s) => ['2 düzen', s.active === 'oyun' ? 'Oyun etkin' : 'Çalışma etkin'],
    noise_gate: (s) => [`Eşik ${s.thresholdDb} dB`, `${s.holdMs} ms`],
    mic_presets: (s) => [(PRESETS.find((p) => p[0] === s.active) || PRESETS[0])[1], `%${s.gain}`],
    mic_monitor: (s) => [`%${s.volume}`],
    voice_activity_monitor: () => ['Sesli kanallarda'],
    auto_device_switch: (s) => [s.headsetFirst ? 'Kulaklık öncelikli' : 'Liste sırasıyla'],
    audio_routing: (s) => [`Bildirim: ${(DEVICES_OUT.find((d) => d[0] === s.notificationOutput) || DEVICES_OUT[0])[1]}`],
    audio_device_profiles: (s) => [s.active === 'masa' ? 'Masa etkin' : 'Oyun etkin'],
    stream_audio_control: (s) => [`Sen %${s.sendVolume}`, `Diğerleri %${s.viewVolume}`],
  };
  const chips = (k) => (on(k) ? SUM[k](S[k]).map((t) => `<span class="dpc-chip">${t}</span>`).join('') : '<span class="dpc-chip off">Kapalı</span>');
  const ultra = (k) => (F[k].ultra ? '<span class="pp-pill is-ultra">Ultra</span>' : '');
  const ico = (k, cat, size = 16) => `<span class="pp-ico c-${CAT[cat].color}">${svg(F[k].icon, size)}</span>`;
  const pv = (k, cls = '') => `<div class="dpc-pv ${cls}" data-pv="${k}">${P[k](S[k])}</div>`;
  const groups = (k) => `<div class="dpc-groups${on(k) ? '' : ' is-off'}">${on(k) ? '' : hint('Özellik kapalı. Açınca bu ayarlar geçerli olur.', '', 'warn')}${G[k](k).join('')}</div>`;
  const enabled = (k) => tg(k, 'enabled', S[k].enabled);
  const head = (cat) => {
    const c = CAT[cat];
    const n = c.keys.filter(on).length;
    return `<div class="pp-cat-head"><span class="pp-ico c-${c.color}">${svg(c.icon, 20)}</span><div><h2>${c.name}</h2><p>${c.desc} · ${n} / ${c.keys.length} açık</p></div></div>`;
  };
  const liveCap = '<span class="dpc-live"><i></i>Canlı önizleme</span>';

  /* ------------------------------------------------------------- drafts */
  const D = {
    /* A: card grid, three columns. A card shows its preview; the open card spans the row. */
    a(cat, open) {
      const card = (k) => {
        if (k === open) {
          return `<article class="us-card dpc-a-card is-open" data-f="${k}" data-open-card>
            <header class="dpc-a-oh">${ico(k, cat)}<div class="dpc-tt2"><b>${F[k].name}</b>${ultra(k)}<small>${F[k].desc}</small></div>${enabled(k)}<button type="button" class="dpc-x" data-open="" aria-label="Kapat">${svg('up', 16)}</button></header>
            <div class="dpc-a-body"><div class="dpc-a-pv">${pv(k, 'lg')}<div class="dpc-c-cap">${liveCap}<span class="dpc-chipline">${chips(k)}</span></div></div>${groups(k)}</div></article>`;
        }
        return `<article class="us-card dpc-a-card${on(k) ? '' : ' is-offc'}" data-f="${k}"><button type="button" class="dpc-a-hit" data-open="${k}">${pv(k, 'sm')}</button>
          <div class="dpc-a-meta"><div class="dpc-tt2"><b>${F[k].name}</b>${ultra(k)}</div>${enabled(k)}</div>
          <p class="dpc-a-desc">${F[k].desc}</p><div class="dpc-a-foot">${chips(k)}<button type="button" class="dpc-more" data-open="${k}">Ayarlar${svg('chev', 14)}</button></div></article>`;
      };
      return `${head(cat)}<section class="us-section"><div class="dpc-a-grid">${CAT[cat].keys.map(card).join('')}</div></section>`;
    },

    /* B: two columns of horizontal cards; a card grows in place, preview banner on top. */
    b(cat, open) {
      const keys = CAT[cat].keys;
      const col = [[], []];
      keys.forEach((k, i) => col[i % 2].push(k));
      const card = (k) => {
        const isO = k === open;
        return `<article class="us-card dpc-b-card${isO ? ' is-open' : ''}${on(k) ? '' : ' is-offc'}" data-f="${k}" ${isO ? 'data-open-card' : ''}>
          <header class="dpc-b-h" data-open="${isO ? '' : k}">${ico(k, cat)}<div class="dpc-tt2"><b>${F[k].name}</b>${ultra(k)}<small>${F[k].desc}</small></div>${enabled(k)}</header>
          ${isO ? `<div class="dpc-b-pv">${pv(k, 'md')}${liveCap}</div>${groups(k)}` : `<div class="dpc-b-sum">${chips(k)}<span class="dpc-more">${svg('down', 14)}</span></div>`}
        </article>`;
      };
      return `${head(cat)}<section class="us-section"><div class="dpc-b-cols">${col.map((c) => `<div class="dpc-b-col">${c.map(card).join('')}</div>`).join('')}</div></section>`;
    },

    /* C: showcase. The open card becomes a wide stage at its place; the rest are compact tiles. */
    c(cat, open) {
      const keys = CAT[cat].keys;
      if (!open) open = keys[0];
      const c = CAT[cat];
      const tile = (k) => `<article class="us-card dpc-c-tile${on(k) ? '' : ' is-offc'}" data-f="${k}"><button type="button" class="dpc-c-hit" data-open="${k}">${pv(k, 'xs')}</button>
        <div class="dpc-c-m"><b>${F[k].name}</b>${enabled(k)}</div><div class="dpc-c-s">${ultra(k)}${chips(k)}</div></article>`;
      const stage = (k) => `<article class="us-card dpc-c-stage c-${c.color}" data-f="${k}" data-open-card>
          <div class="dpc-c-left">${pv(k, 'xl')}<div class="dpc-c-cap">${liveCap}<span class="dpc-chipline">${chips(k)}</span></div></div>
          <div class="dpc-c-right"><div class="dpc-c-top">${ico(k, cat, 18)}${enabled(k)}</div><h3>${F[k].name} ${ultra(k)}</h3><p>${F[k].desc}</p>${groups(k)}</div>
        </article>`;
      const before = keys.slice(0, keys.indexOf(open));
      const after = keys.slice(keys.indexOf(open) + 1);
      return `<div class="dpc-c-head">${head(cat)}</div>
        ${before.length ? `<div class="dpc-c-grid">${before.map(tile).join('')}</div>` : ''}${stage(open)}
        <h4 class="us-section-label dpc-c-lab">Diğer ${c.name.toLocaleLowerCase('tr')} özellikleri</h4><div class="dpc-c-grid">${after.map(tile).join('')}</div>`;
    },

    /* D: bento. Mixed tile sizes, preview-first tiles; the open tile spans the grid and lays
       its setting groups out as tiles of their own. */
    d(cat, open) {
      const SIZE = {
        mini_mode: 'w2 h2', always_on_top: 'w2 h2', window_opacity: 'w2', multi_window: 'w2', screen_edge_actions: 'w2', session_restore: 'w2', window_layouts: 'w2', custom_layouts: 'w2',
        noise_gate: 'w2 h2', mic_presets: 'w2 h2', stream_audio_control: 'w2', audio_routing: 'w2', auto_device_switch: 'w2', audio_device_profiles: 'w2',
      };
      const tile = (k) => {
        if (k === open) {
          const gs = G[k](k);
          return `<article class="dpc-d-open" data-f="${k}" data-open-card>
            <div class="us-card dpc-d-hero">${pv(k, 'lg')}<div class="dpc-d-ov"><div>${ico(k, cat)}<b>${F[k].name}</b>${ultra(k)}<small>${F[k].desc}</small></div>${enabled(k)}</div>${liveCap}<button type="button" class="dpc-x" data-open="" aria-label="Kapat">${svg('x', 15)}</button></div>
            <div class="dpc-d-stack">${gs.map((g) => `<div class="us-card dpc-d-gt${on(k) ? '' : ' is-off'}">${g}</div>`).join('')}</div>
          </article>`;
        }
        return `<article class="us-card dpc-d-tile ${SIZE[k] || ''}${on(k) ? '' : ' is-offc'}" data-f="${k}"><button type="button" class="dpc-d-hit" data-open="${k}">${pv(k, 'sm')}</button>
          <div class="dpc-d-cap"><div class="dpc-tt2"><b>${F[k].name}</b>${ultra(k)}<span class="dpc-chipline">${chips(k)}</span></div>${enabled(k)}</div></article>`;
      };
      return `${head(cat)}<section class="us-section"><div class="dpc-d-grid">${CAT[cat].keys.map(tile).join('')}</div></section>`;
    },

    /* E: story. A hero scene of the whole category, then chapters; each card opens in place
       with a large preview column next to its groups. */
    e(cat, open) {
      const c = CAT[cat];
      let n = 0;
      const card = (k) => {
        n += 1;
        const num = String(n).padStart(2, '0');
        if (k === open) {
          return `<article class="us-card dpc-e-card is-open c-${c.color}" data-f="${k}" data-open-card>
            <div class="dpc-e-oh"><span class="dpc-e-num">${num}</span><div class="dpc-tt2"><b>${F[k].name}</b>${ultra(k)}<small>${F[k].desc}</small></div>${enabled(k)}</div>
            <div class="dpc-e-body"><div class="dpc-e-pv">${pv(k, 'lg')}<div class="dpc-c-cap">${liveCap}<span class="dpc-chipline">${chips(k)}</span></div></div>${groups(k)}</div></article>`;
        }
        return `<article class="us-card dpc-e-card${on(k) ? '' : ' is-offc'}" data-f="${k}"><button type="button" class="dpc-e-hit" data-open="${k}">${pv(k, 'xs')}</button>
          <div class="dpc-e-mid" data-open="${k}"><div class="dpc-tt2"><span class="dpc-e-num sm">${num}</span><b>${F[k].name}</b>${ultra(k)}</div><small>${F[k].desc}</small><span class="dpc-chipline">${chips(k)}</span></div>${enabled(k)}</article>`;
      };
      const hero = cat === 'windows'
        ? `<div class="dpc-e-scene">${other('left:20%;top:12%;width:46%;height:58%')}${dsWin('left:4%;top:8%;width:30%;height:54%')}${win('ds pop', 'left:36%;top:44%;width:22%;height:30%', `<div class="pt"><b>#genel</b></div>${lines(2)}`)}
            ${win('ds side', 'right:0;top:0;width:9%;height:84%', `<div class="sd">${av('A', '#e8457a')}${av('M', '#3e7bfa')}${av('K', '#30b458')}</div>`)}${win('ds call', 'left:68%;top:9%;width:20%;height:30%', '<div class="vid"><i></i><i></i></div>')}
            <div style="position:absolute;right:12%;bottom:17%;width:24%">${callCard('mini')}</div><div class="dpc-dock"><i></i><i></i><i class="ds"><b>3</b></i><i></i></div>
            ${[['01', 'right:36%;bottom:30%'], ['03', 'left:68%;top:3%'], ['05', 'left:56%;top:40%'], ['09', 'left:3%;top:3%'], ['11', 'right:10%;top:40%'], ['08', 'left:52%;bottom:2%']].map(([t, st]) => `<span class="dpc-e-pin" style="${st}">${t}</span>`).join('')}</div>`
        : `<div class="dpc-e-scene audio"><div class="chain">${[['mic', 'Mikrofon', 'Blue Yeti'], ['gate', 'Gürültü kapısı', `${S.noise_gate.thresholdDb} dB`], ['sliders', 'Ön ayar', 'Konuşma'], ['route', 'Yönlendirme', 'İki çıkış'], ['head', 'Kulaklık', 'HyperX Cloud II']].map(([ic, a, b], i) => `<div class="cn"><span class="dpc-e-pin st">${String([0, 1, 2, 6, 5][i] + 1).padStart(2, '0')}</span><span class="ci">${svg(ic, 18)}</span><b>${a}</b><small>${b}</small></div>`).join(`<span class="cw">${Array.from({ length: 7 }, (_, j) => `<i style="height:${[30, 70, 45, 90, 55, 75, 35][j]}%"></i>`).join('')}</span>`)}</div></div>`;
      return `<section class="us-card dpc-e-hero c-${c.color}"><div class="dpc-e-ht"><span class="pp-ico c-${c.color}">${svg(c.icon, 20)}</span><div><h2>${c.name}</h2><p>${c.desc}</p></div><span class="dpc-e-cnt"><b class="tnum">${c.keys.filter(on).length}</b> / ${c.keys.length} açık</span>
        <ol class="dpc-e-toc">${c.chapters.map(([t, , ks], i) => `<li><span>${i + 1}</span>${t}<small>${ks.length} özellik</small></li>`).join('')}</ol></div>${hero}</section>
        ${c.chapters.map(([t, lead, ks], ci) => `<section class="dpc-e-ch"><div class="dpc-e-cht"><span>Bölüm ${ci + 1}</span><h3>${t}</h3><p>${lead}</p></div><div class="dpc-e-list">${ks.map(card).join('')}</div></section>`).join('')}`;
    },
  };

  /* ---------------------------------------------------------------- CSS */
  const CSS = `
  .dpc-root{display:flex;flex-direction:column;gap:18px}
  .dpc-root .pp-ico.sm{width:26px;height:26px;border-radius:7px}
  .dpc-tt2{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;min-width:0;flex:1}
  .dpc-tt2>b{font-size:var(--fs-15);font-weight:650;color:var(--text-0)}
  .dpc-tt2>small{flex-basis:100%;font-size:var(--fs-12);color:var(--text-muted);line-height:1.35}
  .dpc-chip{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:6px;font-size:var(--fs-11);font-weight:600;background:rgba(255,255,255,.07);color:var(--text-1,inherit);white-space:nowrap}
  .dpc-chip.off{opacity:.6}
  .dpc-chipline{display:inline-flex;flex-wrap:wrap;gap:4px}
  .dpc-more{display:inline-flex;align-items:center;gap:2px;margin-left:auto;border:0;background:none;color:var(--text-link,#7eb6ff);font:inherit;font-size:var(--fs-12);font-weight:600;cursor:pointer;padding:0}
  .dpc-x{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;border:0;background:rgba(255,255,255,.06);color:inherit;cursor:pointer;flex:none}
  .dpc-live{display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-11);font-weight:600;color:var(--text-muted);letter-spacing:.02em}
  .dpc-live i{width:6px;height:6px;border-radius:50%;background:#30d158;box-shadow:0 0 0 3px rgba(48,209,88,.18)}
  .is-offc .dpc-pv{filter:saturate(.25) brightness(.8)}

  /* groups and controls */
  .dpc-groups{display:flex;flex-direction:column;gap:10px;min-width:0}
  .dpc-groups.is-off .dpc-g{opacity:.55}
  .dpc-g{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;background:rgba(0,0,0,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
  .dpc-gt{font-size:var(--fs-11);font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted)}
  .dpc-r{display:flex;align-items:center;gap:10px;min-height:32px}
  .dpc-ri{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;flex:none;background:rgba(255,255,255,.06);color:var(--text-1,inherit)}
  .dpc-rc{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
  .dpc-rc b{font-size:var(--fs-13);font-weight:600;color:var(--text-0)}
  .dpc-rc small{font-size:var(--fs-12);color:var(--text-muted);line-height:1.35}
  .dpc-rx{flex:none;display:flex;align-items:center;gap:8px}
  .dpc-note{margin:0;font-size:var(--fs-12);line-height:1.45;color:var(--text-muted)}
  .dpc-note b{color:var(--text-1,inherit);font-weight:600}
  .dpc-note.dim{opacity:.75}
  .dpc-hint{display:flex;gap:8px;align-items:flex-start;margin:0;padding:8px 10px;border-radius:10px;font-size:var(--fs-12);line-height:1.4;background:rgba(255,255,255,.04);color:var(--text-muted)}
  .dpc-hint svg{flex:none;margin-top:1px}
  .dpc-hint.warn{background:rgba(255,176,32,.1);color:#f4c56a}
  .dpc-hint.ok{background:rgba(48,196,108,.1);color:#7fe0a3}
  .dpc-act{display:flex;gap:8px;flex-wrap:wrap}
  .dpc-act .us-btn svg,.dpc-form .us-btn svg{margin-right:2px}
  .dpc-form{display:flex;gap:8px;align-items:center}
  .dpc-in{flex:1;min-width:0;height:32px;display:flex;align-items:center;padding:0 11px;border-radius:9px;background:rgba(0,0,0,.22);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);font-size:var(--fs-13);color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dpc-ib{padding:6px!important;width:30px}
  .dpc-danger{color:#ff7b72!important}
  .dpc-sl{display:inline-flex;align-items:center;gap:10px}
  .dpc-r.dpc-st{flex-wrap:wrap;row-gap:6px}
  .dpc-r.dpc-st>.dpc-rx{flex:1 1 100%;padding-left:0}
  .dpc-r.dpc-st>.dpc-ri+.dpc-rc+.dpc-rx{padding-left:36px}
  .dpc-r.dpc-st .dpc-sl{flex:1}
  .dpc-root input.dpc-range{-webkit-appearance:none!important;appearance:none!important;flex:1;min-width:90px;width:auto;height:6px!important;min-height:0!important;padding:0!important;border:0!important;border-radius:3px!important;margin:0!important;box-shadow:none!important;outline:0;background:linear-gradient(90deg,var(--primary,#587af5) var(--p),rgba(255,255,255,.12) var(--p))!important;cursor:pointer}
  .dpc-root input.dpc-range::-webkit-slider-runnable-track{background:transparent!important;border:0!important;height:6px;box-shadow:none!important}
  .dpc-root input.dpc-range::-webkit-slider-thumb{-webkit-appearance:none!important;appearance:none!important;width:16px;height:16px;margin-top:-5px;border:0!important;border-radius:50%;background:#fff!important;box-shadow:0 1px 4px rgba(0,0,0,.45)!important}
  .dpc-val{min-width:58px;height:24px;display:inline-grid;place-items:center;border-radius:7px;background:rgba(255,255,255,.07);font-size:var(--fs-12);font-weight:650}
  .dpc-seg{display:flex;padding:3px;border-radius:10px;background:rgba(255,255,255,.06);gap:2px}
  .dpc-seg button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:5px;border:0;background:transparent;color:inherit;font:inherit;font-size:var(--fs-12);font-weight:600;padding:6px 8px;border-radius:8px;cursor:pointer;opacity:.75}
  .dpc-seg button[aria-pressed="true"]{background:var(--primary,#587af5);color:#fff;opacity:1;box-shadow:0 1px 3px rgba(0,0,0,.3)}
  .dpc-delay{height:4px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden}
  .dpc-delay i{display:block;height:100%;background:linear-gradient(90deg,#3e7bfa,#9b5de5)}
  .dpc-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:6px}
  .dpc-tile{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:10px;border-radius:10px;border:0;text-align:left;font:inherit;color:inherit;cursor:pointer;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
  .dpc-tile .ti{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.07)}
  .dpc-tile .tl{font-size:var(--fs-12);font-weight:600;line-height:1.25}
  .dpc-tile .tk{position:absolute;top:8px;right:8px;width:18px;height:18px;border-radius:50%;display:none;place-items:center;background:var(--primary,#587af5);color:#fff}
  .dpc-tile[aria-pressed="true"]{background:rgba(88,122,245,.14);box-shadow:inset 0 0 0 1.5px var(--primary,#587af5)}
  .dpc-tile[aria-pressed="true"] .tk{display:grid}
  .dpc-tile[aria-pressed="true"] .ti{background:var(--primary,#587af5);color:#fff}
  .dpc-tiles.mini{grid-template-columns:repeat(3,1fr)}
  .dpc-tiles.mini .dpc-tile{flex-direction:row;align-items:center;padding:7px 8px;gap:7px}
  .dpc-tiles.mini .ti{width:22px;height:22px;border-radius:6px}
  .dpc-tiles.mini .tk{top:50%;transform:translateY(-50%);width:14px;height:14px}
  .dpc-pick{display:flex;flex-direction:column;gap:5px}
  .dpc-pick>small{font-size:var(--fs-11);color:var(--text-muted);font-weight:600}
  .dpc-tt{display:flex;flex-direction:column;gap:6px}
  .dpc-tt.cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
  .dpc-ttile{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
  .dpc-ttile .ti{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;flex:none;background:rgba(255,255,255,.07);opacity:.8}
  .dpc-ttile.on{background:rgba(88,122,245,.1);box-shadow:inset 0 0 0 1px rgba(88,122,245,.45)}
  .dpc-ttile.on .ti{background:var(--primary,#587af5);color:#fff;opacity:1}
  .dpc-ttile .tc{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
  .dpc-ttile .tc b{font-size:var(--fs-12);font-weight:600;line-height:1.3}
  .dpc-ttile .tc small{font-size:var(--fs-11);color:var(--text-muted)}
  .dpc-ttile .us-toggle{transform:scale(.82);transform-origin:right center}
  .dpc-corner{position:relative;width:100%;max-width:260px;aspect-ratio:16/9;border-radius:10px;background:linear-gradient(135deg,#253457,#2d2142);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
  .dpc-corner button{position:absolute;width:30%;height:28%;border:0;border-radius:7px;cursor:pointer;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px dashed rgba(255,255,255,.2);outline:1px dashed rgba(255,255,255,.22);outline-offset:-1px;display:grid;place-items:center}
  .dpc-corner button i{width:60%;height:46%;border-radius:4px;background:rgba(255,255,255,.18)}
  .dpc-corner .c-tl{left:6%;top:8%}.dpc-corner .c-tr{right:6%;top:8%}.dpc-corner .c-bl{left:6%;bottom:8%}.dpc-corner .c-br{right:6%;bottom:8%}
  .dpc-corner button[aria-pressed="true"]{outline:0;background:rgba(88,122,245,.35);box-shadow:inset 0 0 0 1.5px var(--primary,#587af5)}
  .dpc-corner button[aria-pressed="true"] i{background:rgba(255,255,255,.85)}
  .dpc-corner .lbl{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:var(--fs-12);font-weight:650;opacity:.8}
  .dpc-edgep{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .dpc-edgep button{position:relative;height:64px;border:0;border-radius:10px;cursor:pointer;color:inherit;font:inherit;font-size:var(--fs-12);font-weight:600;background:linear-gradient(135deg,#253457,#2d2142);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
  .dpc-edgep button i{position:absolute;top:8px;bottom:8px;width:14px;border-radius:4px;background:rgba(255,255,255,.18)}
  .dpc-edgep .e-left i{left:8px}.dpc-edgep .e-right i{right:8px}
  .dpc-edgep button[aria-pressed="true"]{box-shadow:inset 0 0 0 1.5px var(--primary,#587af5)}
  .dpc-edgep button[aria-pressed="true"] i{background:var(--primary,#587af5);box-shadow:0 0 12px rgba(88,122,245,.7)}
  .dpc-chips{display:flex;flex-wrap:wrap;gap:6px}
  .dpc-chips span{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:8px;background:rgba(255,255,255,.06);font-size:var(--fs-12)}
  .dpc-slots{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
  .dpc-slots .sl{height:58px;border-radius:9px;display:grid;place-items:center;font-size:var(--fs-11);color:var(--text-muted);outline:1px dashed rgba(255,255,255,.18);outline-offset:-1px}
  .dpc-slots .sl.on{outline:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:1px;padding:0 9px;background:rgba(88,122,245,.12);box-shadow:inset 0 0 0 1px rgba(88,122,245,.4)}
  .dpc-slots .sl b{font-size:var(--fs-12);color:var(--text-0)}
  .dpc-lays{display:flex;flex-direction:column;gap:6px}
  .dpc-lays .lay{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.04)}
  .dpc-lays .lc{flex:1;min-width:0;display:flex;flex-direction:column}
  .dpc-lays .lc b{font-size:var(--fs-13)}
  .dpc-lays .lc small{font-size:var(--fs-11);color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dpc-lays .lt{position:relative;width:46px;height:30px;border-radius:5px;flex:none;background:#1a1d27;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
  .dpc-lays .lt i{position:absolute;border-radius:2px;background:rgba(88,122,245,.6)}
  .lt.v-a i:nth-child(1){left:3px;top:3px;width:24px;bottom:3px}.lt.v-a i:nth-child(2){right:3px;top:3px;width:14px;height:11px}.lt.v-a i:nth-child(3){right:3px;bottom:3px;width:14px;height:10px}
  .lt.v-b i:nth-child(1){left:3px;top:3px;right:3px;height:12px}.lt.v-b i:nth-child(2){left:3px;bottom:3px;width:18px;height:10px}.lt.v-b i:nth-child(3){right:3px;bottom:3px;width:18px;height:10px;opacity:.5}
  .lt.v-c i:nth-child(1){left:3px;top:3px;width:18px;height:13px}.lt.v-c i:nth-child(2){right:3px;top:3px;width:18px;height:13px}.lt.v-c i:nth-child(3){left:3px;right:3px;bottom:3px;height:9px}
  .lt.v-d i:nth-child(1){left:3px;top:3px;right:3px;height:8px}.lt.v-d i:nth-child(2){left:3px;bottom:3px;width:18px;height:14px}.lt.v-d i:nth-child(3){right:3px;bottom:3px;width:18px;height:14px}
  .dpc-presets{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
  .dpc-presets .ps{display:flex;flex-direction:column;gap:4px;padding:10px;border-radius:10px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
  .dpc-presets .ps.on{background:rgba(48,180,88,.1);box-shadow:inset 0 0 0 1.5px rgba(48,196,108,.55)}
  .dpc-presets .ps b{font-size:var(--fs-13)}
  .dpc-presets .ps small{font-size:var(--fs-11);color:var(--text-muted);line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .dpc-presets .pi{display:flex;gap:4px}
  .dpc-presets .pi span{width:20px;height:20px;border-radius:6px;display:grid;place-items:center;background:rgba(255,255,255,.06);opacity:.45}
  .dpc-presets .pi span.y{opacity:1;background:rgba(48,180,88,.22);color:#7fe0a3}
  .dpc-presets .pa{display:flex;gap:6px;align-items:center;margin-top:auto;padding-top:4px}
  .dpc-order{display:flex;flex-direction:column;gap:5px}
  .dpc-order .od{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:10px;background:rgba(255,255,255,.04)}
  .dpc-order .dh{opacity:.4;display:grid}
  .dpc-order .n{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:var(--fs-11);font-weight:700;background:rgba(255,255,255,.1)}
  .dpc-order .od:first-child .n{background:#30b458;color:#fff}
  .dpc-order .oc{flex:1;min-width:0;display:flex;flex-direction:column}
  .dpc-order .oc b{font-size:var(--fs-12);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dpc-order .oc small{font-size:var(--fs-11);color:var(--text-muted)}
  .dpc-order .oc small.ok{color:#7fe0a3}
  .dpc-order .mv{display:flex;gap:4px}
  .dpc-add{display:flex;align-items:center;justify-content:center;gap:6px;height:32px;border:0;border-radius:10px;background:none;color:var(--text-link,#7eb6ff);font:inherit;font-size:var(--fs-12);font-weight:600;outline:1px dashed rgba(126,182,255,.4);outline-offset:-1px;cursor:pointer}
  .dpc-test{display:flex;align-items:center;gap:10px}
  .dpc-test .pa-meter{flex:1;min-width:0}

  /* previews */
  .dpc-pv{position:relative;width:100%;height:100%;container-type:size}
  .dpc-scr{position:absolute;inset:0;overflow:hidden;border-radius:10px;background:radial-gradient(90% 80% at 15% 0%,rgba(62,123,250,.35),transparent 60%),radial-gradient(80% 90% at 100% 100%,rgba(155,93,229,.3),transparent 60%),#151821;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
  .dpc-dock{position:absolute;left:50%;bottom:3%;transform:translateX(-50%);display:flex;gap:4px;padding:3px 5px;border-radius:7px;background:rgba(0,0,0,.35);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
  .dpc-dock i{position:relative;width:12px;height:12px;border-radius:3px;background:rgba(255,255,255,.22)}
  .dpc-dock i.ds{background:#587af5}
  .dpc-dock i b{position:absolute;top:-5px;right:-6px;min-width:12px;height:12px;border-radius:6px;background:#f0453a;color:#fff;font-size:var(--fs-11);line-height:12px;text-align:center;padding:0 2px;transform:scale(.8)}
  .no-dock>.dpc-dock{display:none}
  .dpc-w{position:absolute;border-radius:6px;background:#2a2d39;box-shadow:0 8px 20px rgba(0,0,0,.4),inset 0 0 0 1px rgba(255,255,255,.08);overflow:hidden}
  .dpc-w .tb{position:absolute;left:0;right:0;top:0;height:10%;min-height:6px;max-height:12px;background:rgba(255,255,255,.06)}
  .dpc-w .ln{position:absolute;left:10%;right:10%;top:22%;display:flex;flex-direction:column;gap:7%}
  .dpc-w .ln i{display:block;height:4px;border-radius:2px;background:rgba(255,255,255,.12)}
  .dpc-w.other{background:#d9dce4}
  .dpc-w.other .tb{background:#c3c7d2}
  .dpc-w.other .ln i{background:#a9aebc}
  .dpc-w.ds{background:#1f2230}
  .dpc-w.ds .ds-rail{position:absolute;left:0;top:10%;bottom:0;width:14%;background:#171924;display:flex;flex-direction:column;align-items:center;gap:6%;padding-top:6%}
  .dpc-w.ds .ds-rail i{width:58%;aspect-ratio:1;border-radius:30%;background:rgba(255,255,255,.14)}
  .dpc-w.ds .ds-rail i:first-child{background:#587af5}
  .dpc-w.ds .ds-body .ln{left:22%}
  .dpc-w.side .sd{position:absolute;top:14%;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:8%}
  .dpc-w.side .dpc-av{width:56%;max-width:22px}
  .dpc-w.call .vid{position:absolute;inset:14% 6% 6%;display:grid;grid-template-columns:1fr 1fr;gap:4%}
  .dpc-w.call .vid i{border-radius:4px;background:linear-gradient(135deg,#2f3a5c,#3b2c52);display:grid;place-items:center}
  .dpc-w.call.big .vid{bottom:24%}
  .dpc-w.call .vbar{position:absolute;left:0;right:0;bottom:5%;display:flex;justify-content:center;gap:6%}
  .dpc-w.call .vbar span{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12)}
  .dpc-w .red,.dpc-call .red,.tb-btns .red{background:#f0453a!important;color:#fff}
  .dpc-w.pop .pt{position:absolute;left:8%;top:14%;display:flex;flex-direction:column}
  .dpc-w.pop .pt b{font-size:var(--fs-11);font-weight:700;color:#dfe3ff}
  .dpc-w.pop .pt small{font-size:var(--fs-11);color:rgba(255,255,255,.5);display:none}
  .dpc-w.pop .pt~.ln{top:58%}
  .dpc-w .pinb{position:absolute;top:3px;right:3px;width:16px;height:16px;border-radius:50%;display:grid;place-items:center;background:#587af5;color:#fff;z-index:2}
  .dpc-av{display:inline-grid;place-items:center;aspect-ratio:1;border-radius:50%;color:#fff;font-weight:700;font-size:var(--fs-11);width:26px;flex:none}
  .dpc-lbl{position:absolute;display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:6px;background:rgba(10,12,18,.62);backdrop-filter:blur(6px);color:#fff;font-size:var(--fs-11);font-weight:600;white-space:nowrap;z-index:8}
  .dpc-lbl.strong{background:rgba(48,180,88,.85)}
  .dpc-lbl.on-dock{background:rgba(88,122,245,.85)}
  .dpc-call{position:absolute;width:44%;min-width:150px;max-width:220px;z-index:6;padding:9px 10px;border-radius:14px;background:rgba(32,35,48,.58);backdrop-filter:blur(14px) saturate(1.4);box-shadow:0 10px 26px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.16);display:flex;flex-direction:column;gap:8px;transition:left .25s,right .25s,top .25s,bottom .25s}
  .dpc-call .cc-top{display:flex;align-items:center;gap:8px;min-width:0}
  .dpc-call .cc-t{display:flex;flex-direction:column;min-width:0}
  .dpc-call .cc-t b{font-size:var(--fs-12);color:#fff}
  .dpc-call .cc-t small{display:flex;align-items:center;gap:4px;font-size:var(--fs-11);color:rgba(255,255,255,.65);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dpc-call .dot{width:6px;height:6px;border-radius:50%;background:#30d158;flex:none}
  .dpc-call .cc-btns{display:flex;gap:6px}
  .dpc-call .cc-btns span{flex:1;height:24px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.12);color:#fff}
  .dpc-call.mini{position:relative;width:100%;min-width:0;padding:5px 6px;gap:5px;border-radius:9px}
  .dpc-call.mini .dpc-av{width:16px;font-size:0}
  .dpc-call.mini .cc-t small{display:none}
  .dpc-call.mini .cc-t b{font-size:var(--fs-11)}
  .dpc-call.mini .cc-btns span{height:13px;border-radius:5px}
  .dpc-call.mini .cc-btns svg{width:9px;height:9px}
  .dpc-ghost{position:absolute;width:30%;height:26%;border-radius:12px;outline:1.5px dashed rgba(255,255,255,.22);outline-offset:-1px}
  .dpc-ghost.g-tl{left:5%;top:7%}.dpc-ghost.g-tr{right:5%;top:7%}.dpc-ghost.g-bl{left:5%;bottom:17%}.dpc-ghost.g-br{right:5%;bottom:17%}
  .dpc-stripes{position:absolute;inset:0;background:repeating-linear-gradient(45deg,rgba(240,138,36,.55) 0 10px,rgba(62,123,250,.5) 10px 20px)}
  .pv-restore .split{position:absolute;inset:0;display:flex;align-items:center;gap:2%;padding:4%}
  .pv-restore .half{position:relative;flex:1;height:100%;border-radius:8px;overflow:hidden;background:rgba(0,0,0,.25);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
  .pv-restore .arr{color:var(--text-muted)}
  .dpc-traymenu{position:absolute;right:4%;bottom:16%;width:min(56%,200px);padding:5px;border-radius:9px;background:#252836;box-shadow:0 10px 24px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.1);z-index:4}
  .dpc-traymenu .mi{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:6px;font-size:var(--fs-11);color:#e8eaf2}
  .dpc-traymenu .mi:first-child{background:rgba(88,122,245,.3)}
  .dpc-traymenu .ch{margin-left:auto;display:grid;opacity:.6}
  .dpc-traymenu hr{border:0;height:1px;background:rgba(255,255,255,.1);margin:3px 0}
  .dpc-tray{position:absolute;right:0;bottom:0;left:0;height:12%;display:flex;justify-content:flex-end;align-items:center;gap:6px;padding:0 3%;background:rgba(0,0,0,.45)}
  .dpc-tray i{width:10px;height:10px;border-radius:3px;background:rgba(255,255,255,.3)}
  .dpc-tray i.ds{background:#587af5;box-shadow:0 0 0 3px rgba(88,122,245,.3)}
  .dpc-tray .clk{font-size:var(--fs-11);color:rgba(255,255,255,.75)}
  .pv-tray .dpc-dock{display:none}
  .dpc-taskbar{position:absolute;left:0;right:0;bottom:0;height:15%;display:flex;justify-content:center;align-items:center;gap:8px;background:rgba(0,0,0,.5)}
  .dpc-taskbar i{position:relative;width:16px;height:16px;border-radius:4px;background:rgba(255,255,255,.3)}
  .dpc-taskbar i.ds{background:#587af5;box-shadow:0 -2px 0 0 #9fb3ff inset}
  .dpc-taskbar i b{position:absolute;top:-6px;right:-8px;min-width:15px;height:15px;padding:0 3px;border-radius:8px;background:#f0453a;color:#fff;font-size:var(--fs-11);line-height:15px;text-align:center}
  .dpc-thumb{position:absolute;left:50%;bottom:19%;width:min(42%,170px);height:46%;padding:5px;border-radius:8px;background:#232633;box-shadow:0 10px 24px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.12);display:flex;flex-direction:column;gap:6%}
  .dpc-thumb .tb-btns{display:flex;justify-content:center;gap:8%;flex:1;align-items:center}
  .dpc-thumb .tb-btns span{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;background:rgba(255,255,255,.12);color:#fff}
  .pv-adv .mons{position:absolute;inset:8% 5% 10%;display:flex;gap:5%}
  .pv-adv .mon{position:relative;flex:1;border-radius:8px;background:radial-gradient(90% 80% at 15% 0%,rgba(62,123,250,.3),transparent 60%),#1b1e29;box-shadow:inset 0 0 0 2px rgba(255,255,255,.14);overflow:hidden}
  .pv-adv .mon.gone{background:none;box-shadow:none;outline:1.5px dashed rgba(255,255,255,.25);outline-offset:-1px;display:grid;place-items:center}
  .pv-adv .back{color:#7eb6ff}
  .pv-adv .snapg{position:absolute;left:50%;top:0;bottom:0;width:3px;background:#587af5;box-shadow:0 0 10px #587af5}
  .pv-adv .star{position:absolute;right:5px;top:5px;color:#ffd27a;z-index:3}
  .dpc-cursor{position:absolute;color:#fff;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6));z-index:7}
  .dpc-edgeglow{position:absolute;top:0;bottom:16%;width:3px;background:#587af5;box-shadow:0 0 14px 2px rgba(88,122,245,.8);z-index:6}
  .pv-widgets .wg{position:absolute;inset:12% 3% 4%}
  .pv-widgets .wgi{position:absolute;border-radius:6px;background:rgba(88,122,245,.16);box-shadow:inset 0 0 0 1px rgba(88,122,245,.4);display:flex;align-items:flex-start;padding:4px 6px}
  .pv-widgets .wgi span{font-size:var(--fs-11);color:#cfd8ff;font-weight:600}
  .pv-gate .meter{position:absolute;left:5%;right:5%;top:8%;bottom:26%}
  .pv-gate .bars{position:absolute;inset:0;display:flex;align-items:flex-end;gap:2.5%}
  .pv-gate .bars i{flex:1;border-radius:3px 3px 0 0;background:rgba(255,255,255,.16);transition:height .2s}
  .pv-gate .bars i.pass{background:linear-gradient(180deg,#5be38a,#30b458)}
  .pv-gate .bars i.hold{background:rgba(48,180,88,.45)}
  .pv-gate .band{position:absolute;left:0;right:0;background:rgba(48,209,88,.1);border-bottom:1px dashed rgba(48,209,88,.5)}
  .pv-gate .th{position:absolute;left:0;right:0;height:2px;background:#fff;box-shadow:0 0 8px rgba(255,255,255,.6)}
  .pv-gate .th span{position:absolute;right:0;bottom:4px;font-size:var(--fs-11);font-weight:700;padding:1px 6px;border-radius:5px;background:rgba(10,12,18,.7);white-space:nowrap}
  .pv-gate .hold{position:absolute;bottom:-9px;height:7px;border:1.5px solid rgba(48,209,88,.7);border-top:0;border-radius:0 0 4px 4px}
  .pv-gate .hold span{position:absolute;left:0;top:10px;font-size:var(--fs-11);color:#7fe0a3;white-space:nowrap}
  .pv-gate .lg{position:absolute;left:5%;bottom:4%;display:flex;gap:12px;font-size:var(--fs-11);color:var(--text-muted)}
  .pv-gate .lg span{display:inline-flex;align-items:center;gap:5px}
  .pv-gate .lg i{width:9px;height:9px;border-radius:2px;background:rgba(255,255,255,.2)}
  .pv-gate .lg i.hb{background:none;box-shadow:inset 0 0 0 1.5px rgba(48,209,88,.7)}.pv-gate .lg i.pass{background:#30b458}.pv-gate .lg i.hold{background:rgba(48,180,88,.45)}
  .pv-presets{display:flex;align-items:center;justify-content:center;gap:6%}
  .pv-presets .dial{width:clamp(70px,62cqh,130px);aspect-ratio:1;border-radius:50%;background:conic-gradient(from 225deg,#30b458 0 var(--a),rgba(255,255,255,.1) var(--a) 270deg,transparent 270deg);display:grid;place-items:center;flex:none}
  .pv-presets .dial .in{width:78%;aspect-ratio:1;border-radius:50%;background:#151821;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .pv-presets .dial b{font-size:var(--fs-20)}
  .pv-presets .dial small{font-size:var(--fs-11);color:var(--text-muted)}
  .pv-presets .chain{display:flex;align-items:center;gap:5px;color:var(--text-muted)}
  .pv-presets .chip{display:flex;flex-direction:column;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.06)}
  .pv-presets .chip small{font-size:var(--fs-11);opacity:.7}
  .pv-presets .chip b{font-size:var(--fs-12);color:var(--text-1,#ddd)}
  .pv-presets .chip.on{background:rgba(48,180,88,.18);box-shadow:inset 0 0 0 1px rgba(48,196,108,.45)}
  .pv-presets .ar{display:grid;opacity:.5}
  .pv-monitor .flow{position:absolute;inset:0 0 18%;display:flex;align-items:center;justify-content:center;gap:6%}
  .pv-monitor .node{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
  .pv-monitor .wave{display:flex;align-items:center;gap:6px;height:40%}
  .pv-monitor .wave i{width:6px;border-radius:3px;background:rgba(255,255,255,.14)}
  .pv-monitor .wave i.on{background:#30b458}
  .pv-vam .ppl{position:absolute;inset:10% 5%;display:grid;grid-template-columns:1fr 1fr;gap:6%}
  .pv-vam .p{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border-radius:8px;background:rgba(255,255,255,.05)}
  .pv-vam .p.talk .dpc-av{box-shadow:0 0 0 2px #30d158}
  .pv-vam .p b{font-size:var(--fs-11)}
  .pv-vam .lv{width:70%;height:4px;border-radius:2px;background:rgba(255,255,255,.1);overflow:hidden}
  .pv-vam .lv i{display:block;height:100%;background:linear-gradient(90deg,#30b458,#c8e35b)}
  .pv-auto .stack{position:absolute;left:8%;right:8%;top:10%;display:flex;flex-direction:column;gap:6px}
  .pv-auto .d{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.05);font-size:var(--fs-11)}
  .pv-auto .d b{font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pv-auto .d.act{background:rgba(48,180,88,.16);box-shadow:inset 0 0 0 1px rgba(48,196,108,.5)}
  .pv-auto .d.off{opacity:.45}
  .pv-auto .d em{font-style:normal;font-weight:700;color:#7fe0a3}
  .pv-auto .n{width:16px;height:16px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);font-size:var(--fs-11)}
  .pv-auto .plug{position:absolute;left:8%;right:8%;bottom:8%;display:flex;align-items:center;gap:6px;font-size:var(--fs-11);color:#7eb6ff}
  .pv-route .wires{position:absolute;inset:0;width:100%;height:100%}
  .pv-route .wires path{fill:none;stroke:#30b458;stroke-width:1.2;vector-effect:non-scaling-stroke;stroke-width:2}
  .pv-route .wires path.b{stroke:#f0b232}
  .pv-route .src,.pv-route .dst{position:absolute;display:flex;align-items:center;gap:6px;padding:6px 9px;border-radius:9px;background:#232633;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);font-size:var(--fs-11);font-weight:600;white-space:nowrap;max-width:45%}
  .pv-route .src span,.pv-route .dst span{overflow:hidden;text-overflow:ellipsis}
  .pv-route .src{left:4%}.pv-route .dst{right:4%}
  .pv-route .src svg,.pv-route .dst svg{color:#30b458;flex:none}
  .pv-route .b svg{color:#f0b232}
  .pv-prof{display:flex;align-items:center;justify-content:center;gap:5%;padding:0 5%}
  .pv-prof .pc{flex:1;max-width:48%;display:flex;flex-direction:column;gap:4px;padding:9px;border-radius:10px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
  .pv-prof .pc.act{background:rgba(48,180,88,.14);box-shadow:inset 0 0 0 1.5px rgba(48,196,108,.55)}
  .pv-prof .pc b{font-size:var(--fs-13)}
  .pv-prof .pc span{display:flex;align-items:center;gap:5px;font-size:var(--fs-11);color:var(--text-muted);white-space:nowrap;overflow:hidden}
  .pv-stream{display:flex;align-items:center;justify-content:center;gap:8%}
  .pv-stream .mix{display:flex;gap:18px;height:78%}
  .pv-stream .fd{display:flex;flex-direction:column;align-items:center;gap:4px;width:64px}
  .pv-stream .tr{position:relative;flex:1;width:10px;border-radius:5px;background:rgba(255,255,255,.1)}
  .pv-stream .tr i{position:absolute;left:0;right:0;bottom:0;border-radius:5px;background:linear-gradient(0deg,#30b458,#c8e35b)}
  .pv-stream .knob{position:absolute;left:50%;width:22px;height:10px;margin-bottom:-5px;transform:translateX(-50%);border-radius:4px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.5)}
  .pv-stream .fd b{font-size:var(--fs-12)}
  .pv-stream .fd small{font-size:var(--fs-11);color:var(--text-muted);text-align:center;line-height:1.2}
  .pv-stream .fd.muted b{color:#ff7b72}
  .pv-stream .scrn{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 16px;border-radius:12px;background:rgba(255,255,255,.05);font-size:var(--fs-11);color:var(--text-muted)}
  /* small previews: drop the words, keep the drawing */
  @container (max-width: 250px){
    .dpc-lbl,.pv-gate .th span,.pv-gate .hold span,.pv-gate .lg,.pv-presets .chain,.pv-stream .scrn,.pv-auto .plug,.pv-prof .pc span,.dpc-w.pop .pt,.dpc-traymenu .mi span,.pv-widgets .wgi span{display:none!important}
    .dpc-call{min-width:0;width:46%;padding:5px 6px;gap:5px;border-radius:9px}
    .dpc-call .dpc-av{width:15px;font-size:0}.dpc-call .cc-t small{display:none}.dpc-call .cc-t b{font-size:var(--fs-11)}
    .dpc-call .cc-btns span{height:12px;border-radius:4px}.dpc-call .cc-btns svg{width:8px;height:8px}
    .dpc-traymenu{width:40%}.dpc-traymenu .mi{padding:3px 5px}
    .pv-route .src,.pv-route .dst{padding:4px;font-size:0;gap:0}
    .pv-auto .d{padding:3px 5px}.pv-auto .d b{font-size:0}
    .pv-vam .p b{display:none}
    .pv-monitor .node{width:30px;height:30px;border-radius:9px}
    .pv-stream .fd small{display:none}.pv-stream .fd{width:40px}
    .pv-presets .dial{max-width:70px}
    .dpc-thumb .tb-btns span{width:13px;height:13px}.dpc-thumb .tb-btns svg{width:8px;height:8px}
  }
  @container (max-height: 90px){
    .pv-presets .dial b{font-size:var(--fs-12)}.pv-presets .dial small{display:none}
    .pv-stream .fd b{display:none}
    .pv-prof .pc b{font-size:var(--fs-11)}.pv-prof .pc{padding:5px}
    .pv-auto .stack{gap:3px;top:6%}
    .pv-vam .dpc-av{width:16px;font-size:0}
  }

  /* A: grid */
  .dpc-a-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;grid-auto-flow:dense}
  .dpc-a-card{display:flex;flex-direction:column;margin:0}
  .dpc-a-hit{display:block;border:0;padding:0;background:none;cursor:pointer;height:104px;margin:8px 8px 0}
  .dpc-a-meta{display:flex;align-items:center;gap:8px;padding:10px 12px 0}
  .dpc-a-meta .dpc-tt2>b{font-size:var(--fs-13)}
  .dpc-a-desc{margin:4px 12px 0;font-size:var(--fs-12);color:var(--text-muted);line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .dpc-a-foot{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:auto;padding:10px 12px 12px}
  .dpc-a-card.is-open{grid-column:1/-1;box-shadow:inset 0 0 0 1px rgba(88,122,245,.45),0 12px 30px rgba(0,0,0,.25)}
  .dpc-a-oh{display:flex;align-items:center;gap:12px;padding:14px 14px 12px}
  .dpc-a-body{display:grid;grid-template-columns:260px minmax(0,1fr);gap:14px;padding:0 14px 14px}
  .dpc-a-pv{display:flex;flex-direction:column;gap:8px}
  .dpc-a-pv .dpc-pv{height:170px}
  .dpc-a-body .dpc-groups{display:grid;grid-template-columns:1fr;align-content:start}

  /* B: two columns */
  .dpc-b-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
  .dpc-b-col{display:flex;flex-direction:column;gap:10px;min-width:0}
  .dpc-b-card{margin:0}
  .dpc-b-h{display:flex;align-items:flex-start;gap:10px;padding:12px 12px 8px;cursor:pointer}
  .dpc-b-h .dpc-tt2>b{font-size:var(--fs-13)}
  .dpc-b-sum{display:flex;align-items:center;gap:4px;padding:0 12px 12px 52px}
  .dpc-b-card.is-open{box-shadow:inset 0 0 0 1px rgba(88,122,245,.45),0 12px 30px rgba(0,0,0,.25)}
  .dpc-b-card.is-open .dpc-b-h{padding-bottom:12px;border-bottom:1px solid var(--border-2)}
  .dpc-b-pv{padding:12px 12px 4px;display:flex;flex-direction:column;gap:6px}
  .dpc-b-pv .dpc-pv{height:150px}
  .dpc-b-card.is-open .dpc-groups{padding:6px 12px 12px}
  .dpc-b-card .dpc-g{background:transparent;box-shadow:none;padding:6px 0 0;border-top:1px solid var(--border-2);border-radius:0}
  .dpc-b-card .dpc-g:first-child{border-top:0}
  

  /* C: showcase */
  .dpc-c-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .dpc-c-count{font-size:var(--fs-12);color:var(--text-muted)}
  .dpc-c-count b{font-size:var(--fs-20);color:var(--text-0);margin-right:2px}
  .dpc-c-stage{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:0;margin:0;padding:0;background:radial-gradient(600px 300px at 0% 0%,rgba(62,123,250,.22),transparent 70%),var(--surface-0);box-shadow:inset 0 0 0 1px rgba(88,122,245,.35)}
  .dpc-c-stage.c-green{background:radial-gradient(600px 300px at 0% 0%,rgba(48,180,88,.2),transparent 70%),var(--surface-0);box-shadow:inset 0 0 0 1px rgba(48,180,88,.35)}
  .dpc-c-left{display:flex;flex-direction:column;gap:10px;padding:16px;border-right:1px solid var(--border-2)}
  .dpc-c-left .dpc-pv{flex:1;min-height:250px}
  .dpc-c-cap{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .dpc-c-right{display:flex;flex-direction:column;gap:6px;padding:16px}
  .dpc-c-top{display:flex;align-items:center;justify-content:space-between}
  .dpc-c-right h3{margin:6px 0 0;font-size:var(--fs-20);font-weight:700;display:flex;align-items:center;gap:8px}
  .dpc-c-right>p{margin:0 0 6px;font-size:var(--fs-13);color:var(--text-muted)}
  .dpc-c-lab{margin-top:4px}
  .dpc-c-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  .dpc-c-tile{margin:0;display:flex;flex-direction:column;padding:8px}
  .dpc-c-hit{border:0;padding:0;background:none;height:74px;cursor:pointer}
  .dpc-c-m{display:flex;align-items:center;gap:6px;padding:8px 2px 0}
  .dpc-c-m b{flex:1;font-size:var(--fs-12);font-weight:650;line-height:1.25}
  .dpc-c-m .us-toggle{transform:scale(.8);transform-origin:right center}
  .dpc-c-s{display:flex;flex-wrap:wrap;gap:4px;padding:6px 2px 2px}

  /* D: bento */
  .dpc-d-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:118px;gap:10px;grid-auto-flow:dense}
  .dpc-d-tile{position:relative;margin:0;padding:6px 6px 0;overflow:hidden;display:flex;flex-direction:column}
  .dpc-d-tile.w2{grid-column:span 2}.dpc-d-tile.h2{grid-row:span 2}
  .dpc-d-hit{position:relative;flex:1;min-height:0;border:0;padding:0;background:none;cursor:pointer}
  .dpc-d-cap{display:flex;align-items:center;gap:8px;padding:7px 6px 8px}
  .dpc-d-cap .dpc-tt2{flex-wrap:nowrap;overflow:hidden}
  .dpc-d-cap .dpc-tt2>b{font-size:var(--fs-13);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dpc-d-cap .dpc-chipline{flex-wrap:nowrap}
  .dpc-d-cap .us-toggle{transform:scale(.8);transform-origin:right center;flex:none}
  .dpc-d-tile:not(.w2) .dpc-chipline,.dpc-d-tile:not(.w2) .pp-pill{display:none}
  .dpc-d-open{grid-column:1/-1;grid-row:span 4;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start}
  .dpc-d-stack{display:flex;flex-direction:column;gap:10px;min-width:0}
  .dpc-d-hero{position:relative;margin:0;height:340px;overflow:hidden;display:flex;flex-direction:column;padding:6px;box-shadow:inset 0 0 0 1px rgba(88,122,245,.5)}
  .dpc-d-hero>.dpc-pv{flex:1;min-height:0}
  .dpc-d-ov{display:flex;align-items:flex-end;gap:10px;padding:10px 8px 6px}
  .dpc-d-ov>div{flex:1;display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}
  .dpc-d-ov b{font-size:var(--fs-17);color:var(--text-0)}
  .dpc-d-ov small{flex-basis:100%;font-size:var(--fs-12);color:var(--text-muted)}
  .dpc-d-hero>.dpc-live{position:absolute;left:14px;top:14px;padding:3px 8px;border-radius:6px;background:rgba(10,12,18,.6);color:#fff}
  .dpc-d-hero>.dpc-x{position:absolute;right:14px;top:14px;color:#fff;background:rgba(10,12,18,.6)}
  .dpc-d-gt{margin:0;padding:12px}
  .dpc-d-gt .dpc-g{padding:0;background:none;box-shadow:none}
  .dpc-d-gt.is-off{opacity:.55}

  /* E: story */
  .dpc-e-hero{margin:0;padding:14px;display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.3fr);gap:14px;align-items:center;background:radial-gradient(500px 240px at 100% 0%,rgba(62,123,250,.2),transparent 70%),var(--surface-0)}
  .dpc-e-hero.c-green{background:radial-gradient(500px 240px at 100% 0%,rgba(48,180,88,.2),transparent 70%),var(--surface-0)}
  .dpc-e-ht{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}
  .dpc-e-toc{flex-basis:100%;list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
  .dpc-e-toc li{display:flex;align-items:center;gap:8px;font-size:var(--fs-12);font-weight:600}
  .dpc-e-toc li span{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:var(--fs-11);background:rgba(126,182,255,.16);color:var(--text-link,#7eb6ff)}
  .dpc-e-toc li small{margin-left:auto;font-weight:500;color:var(--text-muted);font-size:var(--fs-11)}
  .dpc-e-ht .pp-ico{width:40px;height:40px;border-radius:11px}
  .dpc-e-ht h2{margin:0;font-size:var(--fs-20);font-weight:700}
  .dpc-e-ht p{margin:2px 0 0;font-size:var(--fs-13);color:var(--text-muted)}
  .dpc-e-ht>div{flex:1;min-width:0}
  .dpc-e-ht .dpc-e-cnt{flex-basis:100%}
  .dpc-e-cnt{font-size:var(--fs-12);color:var(--text-muted)}.dpc-e-cnt b{font-size:var(--fs-20);color:var(--text-0)}
  .dpc-e-scene{position:relative;height:190px;border-radius:12px;overflow:hidden;container-type:size;background:radial-gradient(90% 80% at 15% 0%,rgba(62,123,250,.35),transparent 60%),radial-gradient(80% 90% at 100% 100%,rgba(155,93,229,.3),transparent 60%),#151821;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
  .dpc-e-scene .dpc-call{width:100%;min-width:0}
  .dpc-e-pin{position:absolute;z-index:9;min-width:24px;height:20px;padding:0 6px;border-radius:10px;display:grid;place-items:center;font-size:var(--fs-11);font-weight:800;color:#fff;background:#3e7bfa;box-shadow:0 0 0 3px rgba(62,123,250,.3)}
  .dpc-e-scene.audio{display:flex;align-items:center;justify-content:center;padding:0 14px}
  .dpc-e-scene .chain{display:flex;align-items:center;gap:2px;width:100%}
  .dpc-e-scene .cn{position:relative;flex:none;width:62px;display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center}
  .dpc-e-scene .ci{width:40px;height:40px;border-radius:14px;display:grid;place-items:center;background:rgba(48,180,88,.18);box-shadow:inset 0 0 0 1px rgba(48,196,108,.45);color:#7fe0a3}
  .dpc-e-scene .cn b{font-size:var(--fs-12)}.dpc-e-scene .cn small{font-size:var(--fs-11);color:var(--text-muted)}
  .dpc-e-pin.st{position:absolute;top:-12px;right:0;background:#30b458;box-shadow:0 0 0 3px rgba(48,180,88,.3)}
  .dpc-e-scene .cw{flex:1;display:flex;align-items:center;justify-content:center;gap:2px;height:28px;margin-bottom:26px}
  .dpc-e-scene .cw i{width:3px;border-radius:2px;background:rgba(127,224,163,.7)}
  .dpc-e-ch{display:flex;flex-direction:column;gap:10px}
  .dpc-e-cht span{font-size:var(--fs-11);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-link,#7eb6ff)}
  .dpc-e-cht h3{margin:2px 0 0;font-size:var(--fs-17);font-weight:700}
  .dpc-e-cht p{margin:2px 0 0;font-size:var(--fs-13);color:var(--text-muted)}
  .dpc-e-list{display:flex;flex-direction:column;gap:8px}
  .dpc-e-card{margin:0;display:flex;align-items:center;gap:12px;padding:8px 12px 8px 8px}
  .dpc-e-hit{flex:none;width:118px;height:70px;border:0;padding:0;background:none;cursor:pointer}
  .dpc-e-mid{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;cursor:pointer}
  .dpc-e-mid .dpc-tt2>b{font-size:var(--fs-13)}
  .dpc-e-mid>small{font-size:var(--fs-12);color:var(--text-muted)}
  .dpc-e-num{font-size:var(--fs-12);font-weight:800;color:var(--text-link,#7eb6ff);font-variant-numeric:tabular-nums}
  .dpc-e-num.sm{font-size:var(--fs-11)}
  .dpc-e-card.is-open{flex-direction:column;align-items:stretch;padding:0;gap:0;box-shadow:inset 3px 0 0 #3e7bfa,inset 0 0 0 1px rgba(88,122,245,.4)}
  .dpc-e-card.is-open.c-green{box-shadow:inset 3px 0 0 #30b458,inset 0 0 0 1px rgba(48,180,88,.4)}
  .dpc-e-oh{display:flex;align-items:center;gap:12px;padding:14px 14px 10px 16px}
  .dpc-e-oh .dpc-e-num{font-size:var(--fs-20)}
  .dpc-e-body{display:grid;grid-template-columns:250px minmax(0,1fr);gap:14px;padding:0 14px 14px 16px}
  .dpc-e-pv{display:flex;flex-direction:column;gap:8px}
  .dpc-e-pv .dpc-pv{height:160px}
  .dpc-e .dpc-corner{max-width:200px}
  `;

  /* ------------------------------------------------------------- render */
  let CUR = { id: 'a', cat: 'windows', open: null };
  function render() {
    const tab = document.querySelector('.us-tab.pp-tab');
    const backBtn = tab.querySelector('.pp-back');
    [...tab.children].forEach((n) => { if (n !== backBtn) n.remove(); });
    const root = document.createElement('div');
    root.className = `dpc-root dpc-${CUR.id}`;
    root.innerHTML = D[CUR.id](CUR.cat, CUR.open);
    tab.appendChild(root);
  }
  function refreshPreview(k) {
    document.querySelectorAll(`[data-pv="${k}"]`).forEach((n) => { n.innerHTML = P[k](S[k]); });
  }
  function bind() {
    if (window.__dpcBound) return;
    window.__dpcBound = true;
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tg],[data-set],[data-open]');
      if (!t || !t.closest('.dpc-root')) return;
      e.preventDefault();
      const scroller = document.querySelector('.us-main-scroll');
      const keep = scroller ? scroller.scrollTop : 0;
      if (t.hasAttribute('data-tg')) {
        const [k, p] = t.getAttribute('data-tg').split('.');
        S[k][p] = !S[k][p];
      } else if (t.hasAttribute('data-set')) {
        const [k, p] = t.getAttribute('data-set').split('.');
        const v = t.getAttribute('data-v');
        S[k][p] = /^-?\d+$/.test(v) ? Number(v) : v;
      } else {
        CUR.open = t.getAttribute('data-open') || null;
      }
      render();
      if (scroller) scroller.scrollTop = keep;
    });
    document.addEventListener('input', (e) => {
      const t = e.target.closest('[data-rg]');
      if (!t) return;
      const [k, p] = t.getAttribute('data-rg').split('.');
      S[k][p] = Number(t.value);
      t.style.setProperty('--p', `${((t.value - t.min) / (t.max - t.min)) * 100}%`);
      const out = document.querySelector(`[data-out="${k}.${p}"]`);
      if (out) out.textContent = fmtv(out.getAttribute('data-fmt'), S[k][p]);
      refreshPreview(k);
    });
  }

  const DEFAULT_OPEN = {
    a: { windows: 'window_opacity', audio: 'audio_routing' },
    b: { windows: 'screen_edge_actions', audio: 'mic_presets' },
    c: { windows: 'mini_mode', audio: 'noise_gate' },
    d: { windows: 'always_on_top', audio: 'stream_audio_control' },
    e: { windows: 'mini_mode', audio: 'mic_monitor' },
  };

  /* Scroll so the open card is fully in view with as much of the page above it as fits. */
  function frame() {
    const sc = document.querySelector('.us-main-scroll');
    const card = document.querySelector('[data-open-card]');
    if (!sc || !card) return;
    sc.scrollTop = 0;
    const sr = sc.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const top = cr.top - sr.top;
    const bottom = cr.bottom - sr.top;
    let want = 0;
    if (bottom > sc.clientHeight - 16) want = cr.height + 32 > sc.clientHeight ? top - 16 : bottom - sc.clientHeight + 24;
    sc.scrollTop = Math.max(0, want);
  }

  window.__dpcDraft = function (id, cat, open) {
    if (!document.getElementById('dpc-css')) {
      const st = document.createElement('style'); st.id = 'dpc-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    bind();
    CUR = { id, cat, open: open || DEFAULT_OPEN[id][cat] };
    render();
    frame();
    const nav = document.querySelector('.s3-row[data-nav="premium"]');
    if (nav) nav.scrollIntoView({ block: 'center' });
  };
  window.__dpcKeys = (cat) => CAT[cat].keys.slice();
})();
