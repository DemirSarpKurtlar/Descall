/* Descall+ settings drafts, rendered inside the real app's settings window.
 * capture.cjs opens /settings/premium against the e2e mock, injects this file and
 * calls window.__dpxDraft(id). Only the Descall+ page body is replaced; the settings
 * window, left menu, fonts and components (us-card, us-row, us-toggle, us-btn,
 * us-section-label) are the app's own. Static mockup: nothing here is wired up. */
(function () {
  const I = {
    win: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18"/>',
    key: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h1M10.5 10h1M14.5 10h1M8 14h8"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    game: '<path d="M7 8h10a4 4 0 0 1 4 4.4l-.5 3.6a2.6 2.6 0 0 1-4.6 1.2L14.5 15h-5l-1.4 2.2a2.6 2.6 0 0 1-4.6-1.2L3 12.4A4 4 0 0 1 7 8z"/><path d="M8 11v3M6.5 12.5h3"/>',
    zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M9 3v18M9 12h12"/>',
    wand: '<path d="M4 20L16 8M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
    vol: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/>',
    gift: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8c-2-4-6-4-6-1.5S9.5 8 12 8zm0 0c2-4 6-4 6-1.5S14.5 8 12 8z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    clip: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  };
  const svg = (n, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
  const tile = (n, c) => `<span class="dpx-ico c-${c}">${svg(n, 17)}</span>`;
  const tg = (on) => `<button class="us-toggle${on ? ' active' : ''}" type="button" role="switch" aria-checked="${on}"><span class="us-toggle-knob"></span></button>`;

  let STAR = '';
  const badge = (plan, variant) => {
    const label = plan === 'ultra' ? 'Ultra' : 'Descall+';
    if (variant === 'inline') return `<span class="dsc-premium-badge dsc-premium-badge--inline is-${plan}" role="img" aria-label="${label}"><span class="dsc-premium-badge-mark">${STAR}</span></span>`;
    return `<span class="dsc-premium-badge dsc-premium-badge--chip is-${plan}" role="img" aria-label="${label}"><span class="dsc-premium-badge-mark">${STAR}</span><span class="dsc-premium-badge-label">${label}</span></span>`;
  };

  const CATS = [
    { k: 'win', c: 'blue', name: 'Pencereler', desc: 'Mini mod, üstte kalma, ayrı pencereler', on: 5, all: 12, plus: 8 },
    { k: 'key', c: 'indigo', name: 'Kısayollar', desc: 'Genel sessize alma, bas-konuş', on: 3, all: 7, plus: 6 },
    { k: 'bell', c: 'red', name: 'Bildirimler', desc: 'Geçmiş, odak modu, profiller', on: 2, all: 4, plus: 4 },
    { k: 'mic', c: 'green', name: 'Ses', desc: 'Gürültü kapısı, mikrofon dinleme', on: 4, all: 8, plus: 7 },
    { k: 'game', c: 'orange', name: 'Oyun', desc: "Oyun durumu, HUD'lar, anlık klip", on: 3, all: 5, plus: 2 },
    { k: 'zap', c: 'teal', name: 'Verimlilik', desc: 'Pano geçmişi, uygulama kilidi', on: 1, all: 4, plus: 4 },
    { k: 'layout', c: 'purple', name: 'Masaüstü araçları', desc: 'Kenar çubuğu, bileşenler', on: 0, all: 3, plus: 0, ultra: true },
    { k: 'wand', c: 'pink', name: 'Otomasyon ve profiller', desc: 'Çalışma alanları, çoklu hesap', on: 0, all: 4, plus: 0, ultra: true },
  ];

  const CSS = `
  .dpx-ico{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;flex:none;color:#fff;box-shadow:inset 0 .5px 0 rgba(255,255,255,.3)}
  .dpx-ico.c-blue{background:#3e7bfa}.dpx-ico.c-indigo{background:#5e5ce6}.dpx-ico.c-red{background:#f0453a}.dpx-ico.c-green{background:#30b458}
  .dpx-ico.c-orange{background:#f08a24}.dpx-ico.c-teal{background:#1aa6b7}.dpx-ico.c-purple{background:#9b5de5}.dpx-ico.c-pink{background:#e8457a}
  .dpx-ico.c-gray{background:#6b6f80}.dpx-ico.c-yellow{background:#e9b10c}
  .dpx-hero{position:relative;overflow:hidden;display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center;padding:20px 22px!important;
    background:radial-gradient(420px 200px at 100% 0%,rgba(242,170,96,.20),transparent 70%),radial-gradient(380px 220px at 0% 100%,rgba(88,122,246,.14),transparent 70%),var(--dpx-card,rgba(255,255,255,.04))!important;
    box-shadow:inset 0 0 0 1px rgba(255,200,120,.22)!important}
  .dpx-hero h2{display:flex;align-items:center;gap:8px;font-size:22px;font-weight:700;margin:0}
  .dpx-hero .sub{margin-top:4px;font-size:13.5px;opacity:.72}
  .dpx-stats{display:flex;gap:8px;margin-top:14px}
  .dpx-stat{padding:8px 12px;border-radius:12px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);font-size:12px;opacity:.95}
  .dpx-stat b{display:block;font-size:16px}
  .dpx-gift{display:flex;align-items:center;gap:14px;padding:12px 16px 12px 12px;border-radius:16px;background:rgba(0,0,0,.22);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
  .dpx-ring{position:relative;width:72px;height:72px}
  .dpx-ring svg{position:absolute;inset:0;transform:rotate(-90deg)}
  .dpx-ring div{position:absolute;inset:0;display:grid;place-items:center;text-align:center;font-size:10.5px;opacity:.75;line-height:1.1}
  .dpx-ring b{display:block;font-size:19px;opacity:1}
  .dpx-gift small{display:block;font-size:12px;opacity:.65}
  .dpx-amt{display:flex;align-items:center;gap:6px;font-size:19px;font-weight:700;margin:2px 0}
  .dpx-coin{width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe7a3,#e4a73d 70%);box-shadow:inset 0 0 0 1.5px rgba(120,70,0,.35);flex:none;display:inline-block}
  .dpx-bar{display:flex;gap:10px;align-items:center;margin:0 0 12px}
  .dpx-search{flex:1;display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;border-radius:12px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);font-size:14px;opacity:.85}
  .dpx-search .k{margin-left:auto;font-size:11px;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.08);opacity:.8}
  .dpx-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  .dpx-tile{padding:14px!important;display:flex;flex-direction:column;gap:2px;min-height:128px;margin:0!important}
  .dpx-tile .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
  .dpx-tile b{font-size:14.5px}
  .dpx-tile p{font-size:12px;opacity:.6;margin:0;line-height:1.35}
  .dpx-tile .foot{margin-top:auto;padding-top:10px;font-size:12px;opacity:.85}
  .dpx-prog{height:4px;border-radius:2px;background:rgba(255,255,255,.1);margin-top:6px;overflow:hidden}
  .dpx-prog i{display:block;height:100%;border-radius:2px;background:#30d158}
  .dpx-tag{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:2px 7px;border-radius:6px;background:rgba(242,170,96,.15);color:#f4c27f}
  .dpx-tag.n{background:rgba(255,255,255,.08);color:inherit;opacity:.8}
  .dpx-tag svg{width:11px;height:11px}
  .dpx-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .dpx-back{display:flex;align-items:center;gap:4px;font-size:14px;color:var(--text-link,#7eb6ff);margin:0 0 6px}
  .dpx-head{display:flex;align-items:center;gap:12px;margin-bottom:14px}
  .dpx-head .dpx-ico{width:40px;height:40px;border-radius:11px}
  .dpx-head h2{margin:0;font-size:20px} .dpx-head p{margin:2px 0 0;font-size:13px;opacity:.65}
  .dpx-sub{margin:0 14px 14px 58px;padding:14px;border-radius:14px;background:rgba(0,0,0,.2);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
  .dpx-meter{position:relative;height:30px;border-radius:9px;background:rgba(255,255,255,.06);overflow:hidden;margin:10px 0 6px}
  .dpx-meter i{position:absolute;left:0;top:0;bottom:0;width:58%;background:linear-gradient(90deg,rgba(48,209,88,.5),rgba(48,209,88,.85))}
  .dpx-meter b{position:absolute;top:-2px;bottom:-2px;left:34%;width:3px;border-radius:2px;background:#fff;box-shadow:0 0 0 4px rgba(88,122,246,.35)}
  .dpx-scale{display:flex;justify-content:space-between;font-size:11px;opacity:.55}
  .dpx-cols{display:grid;grid-template-columns:230px 1fr;gap:14px;align-items:start}
  .dpx-catrow{display:flex;align-items:center;gap:10px;padding:9px 12px;font-size:14px}
  .dpx-catrow .n{margin-left:auto;font-size:12px;opacity:.6}
  .dpx-catrow.on{background:rgba(88,122,246,.18)}
  .dpx-catrow + .dpx-catrow{border-top:1px solid rgba(255,255,255,.06)}
  .dpx-catrow .dpx-ico{width:26px;height:26px;border-radius:7px} .dpx-catrow .dpx-ico svg{width:15px;height:15px}
  .dpx-catrow.dim{opacity:.5}
  .dpx-strip{display:flex;align-items:center;gap:12px;padding:12px 16px!important;margin-bottom:14px!important}
  .dpx-strip .t b{display:block;font-size:15px} .dpx-strip .t small{font-size:12.5px;opacity:.65}
  .dpx-strip .kv{margin-left:auto;display:flex;gap:20px;align-items:center}
  .dpx-strip .kv small{display:block;font-size:11.5px;opacity:.6} .dpx-strip .kv b{font-size:14px;display:flex;align-items:center;gap:6px}
  .dpx-scrim{position:absolute;inset:0;background:rgba(10,11,16,.45);backdrop-filter:blur(3px);z-index:5}
  .dpx-drawer{position:absolute;top:0;right:0;bottom:0;width:400px;z-index:6;padding:22px;overflow:hidden;
    background:rgba(30,32,44,.94);backdrop-filter:blur(40px) saturate(1.8);-webkit-backdrop-filter:blur(40px) saturate(1.8);box-shadow:-24px 0 60px rgba(0,0,0,.4),inset 1px 0 0 rgba(255,255,255,.1)}
  .dpx-drawer .dh{display:flex;align-items:center;gap:12px}
  .dpx-drawer .dh .x{margin-left:auto;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.08)}
  .dpx-prev{position:relative;height:132px;border-radius:14px;margin:16px 0 14px;overflow:hidden;background:linear-gradient(135deg,#3b2f4a,#1e3343 55%,#2a3a22);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
  .dpx-prev::before{content:"";position:absolute;inset:0;background:radial-gradient(120px 60px at 70% 75%,rgba(255,170,80,.35),transparent 70%),repeating-linear-gradient(100deg,rgba(255,255,255,.03) 0 14px,transparent 14px 28px)}
  .dpx-hud{position:absolute;top:10px;right:10px;padding:8px 10px;border-radius:10px;background:rgba(16,17,24,.72);font-size:11px;line-height:1.55;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
  .dpx-hud .g{color:#7fe39c}
  .dpx-prev .l{position:absolute;left:10px;bottom:8px;font-size:11px;opacity:.6}
  .dpx-corners{display:grid;grid-template-columns:repeat(2,46px);gap:6px}
  .dpx-corners span{height:30px;border-radius:8px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);position:relative}
  .dpx-corners span::after{content:"";position:absolute;width:11px;height:7px;border-radius:2px;background:rgba(255,255,255,.3)}
  .dpx-corners span:nth-child(1)::after{top:5px;left:5px}.dpx-corners span:nth-child(2)::after{top:5px;right:5px}.dpx-corners span:nth-child(3)::after{bottom:5px;left:5px}.dpx-corners span:nth-child(4)::after{bottom:5px;right:5px}
  .dpx-corners span.on{background:rgba(88,122,246,.22);box-shadow:inset 0 0 0 1px rgba(88,122,246,.6)}.dpx-corners span.on::after{background:#aebdff}
  .dpx-slider{width:180px;height:6px;border-radius:3px;background:rgba(255,255,255,.12);position:relative}
  .dpx-slider i{position:absolute;left:0;top:0;bottom:0;width:70%;border-radius:3px;background:#587af6}
  .dpx-slider i::after{content:"";position:absolute;right:-9px;top:-6px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.3)}
  .dpx-note{display:flex;gap:8px;font-size:12px;opacity:.6;line-height:1.5;margin-top:12px}
  .dpx-tabs{display:inline-flex;width:max-content;align-self:flex-start;padding:3px;border-radius:11px;background:rgba(118,118,128,.2);margin:-4px 0 16px}
  .dpx-tabs span{padding:7px 16px;border-radius:8px;font-size:13.5px;font-weight:600;opacity:.75}
  .dpx-tabs span.on{background:rgba(255,255,255,.16);opacity:1;box-shadow:0 2px 8px rgba(0,0,0,.25)}
  .dpx-tl{display:flex;margin-top:16px}
  .dpx-tl div{flex:1;position:relative;padding-top:20px;font-size:12px;opacity:.65}
  .dpx-tl div::before{content:"";position:absolute;top:6px;left:0;right:0;height:2px;background:rgba(255,255,255,.12)}
  .dpx-tl div.done::before{background:linear-gradient(90deg,#ef8f5b,#ffd27a)}
  .dpx-tl i{position:absolute;top:0;left:0;width:14px;height:14px;border-radius:50%;background:#2a2c3a;box-shadow:inset 0 0 0 2px rgba(255,255,255,.25)}
  .dpx-tl .done i{background:linear-gradient(180deg,#ffd27a,#ef8f5b);box-shadow:none}
  .dpx-tl .next i{box-shadow:inset 0 0 0 2px #ffd27a,0 0 0 4px rgba(255,200,120,.15)}
  .dpx-tl b{display:block;font-size:13px;opacity:1}
  .dpx-tl .done,.dpx-tl .next{opacity:1}
  .dpx-quick{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .dpx-qt{padding:12px!important;margin:0!important;display:flex;flex-direction:column;gap:10px}
  .dpx-qt .r{display:flex;justify-content:space-between;align-items:flex-start}
  .dpx-qt b{font-size:13.5px} .dpx-qt small{display:block;font-size:12px;opacity:.6}
  .dpx-redeem{display:flex;gap:8px;align-items:center;padding:12px 14px}
  .dpx-redeem .dpx-search{height:36px}
  .dpx-plans{display:grid;grid-template-columns:1.25fr 1fr 1fr 1.1fr;font-size:13.5px}
  .dpx-plans > div{padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:8px}
  .dpx-plans .h{flex-direction:column;align-items:flex-start;gap:6px;padding:16px 14px}
  .dpx-plans .h b{font-size:15px} .dpx-plans .h small{font-size:12px;opacity:.6}
  .dpx-plans .cur{background:rgba(255,200,120,.06)}
  .dpx-plans .h.cur{box-shadow:inset 0 3px 0 #ffd27a}
  .dpx-plans .no{opacity:.3}.dpx-plans .yes{color:#6fe08f}
  .dpx-plans .lab{opacity:.85}.dpx-plans .lab svg{opacity:.6}
  .dpx-plans small.x{opacity:.55;font-size:12px}
  .dpx-plans .last{border-bottom:0}
  .dpx-cur{font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:rgba(255,200,120,.18);color:#f6c58a}
  `;

  function hero() {
    return `<div class="us-card dpx-hero">
      <div>
        <h2>Descall Ultra ${badge('ultra', 'inline')}</h2>
        <div class="sub">Süresiz üyelik · Descall ekibi tarafından verildi</div>
        <div class="dpx-stats">
          <div class="dpx-stat"><b>47</b>özelliğe erişimin var</div>
          <div class="dpx-stat"><b>18</b>özellik açık</div>
          <div class="dpx-stat"><b>15.000</b>DesCoin aldın</div>
        </div>
      </div>
      <div class="dpx-gift">
        <div class="dpx-ring">
          <svg viewBox="0 0 100 100" width="72" height="72"><defs><linearGradient id="dpxg"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#ef8f5b"/></linearGradient></defs>
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="9"/>
            <circle cx="50" cy="50" r="42" fill="none" stroke="url(#dpxg)" stroke-width="9" stroke-linecap="round" stroke-dasharray="264" stroke-dashoffset="12"/></svg>
          <div><span><b>30</b>gün</span></div>
        </div>
        <div><small>Sonraki hediye</small><div class="dpx-amt"><span class="dpx-coin"></span>15.000</div><small>6 Aralık 2026</small></div>
      </div>
    </div>`;
  }

  const DRAFTS = {
    a1() {
      const tiles = CATS.map((c) => `<div class="us-card dpx-tile">
        <div class="top">${tile(c.k, c.c)}${c.ultra ? `<span class="dpx-tag">Ultra</span>` : c.k === 'win' || c.k === 'key' ? `<span class="dpx-tag n">${svg('monitor', 11)}Masaüstü</span>` : ''}</div>
        <b>${c.name}</b><p>${c.desc}</p>
        <div class="foot">${c.on} / ${c.all} açık<div class="dpx-prog"><i style="width:${Math.round((c.on / c.all) * 100)}%"></i></div></div>
      </div>`).join('');
      return { title: 'Descall+', html: `
        <section class="us-section">${hero()}</section>
        <section class="us-section">
          <h4 class="us-section-label">Özellikler</h4>
          <div class="dpx-bar"><div class="dpx-search">${svg('search', 16)}Özellik ara<span class="k">Ctrl K</span></div>
            <div class="us-btn-row"><button class="us-btn primary">Tümü</button><button class="us-btn ghost">Açık</button><button class="us-btn ghost">Kapalı</button></div></div>
          <div class="dpx-tiles">${tiles}</div>
        </section>
        <section class="us-section"><div class="dpx-two">
          <div class="us-card stack"><div class="us-row"><div class="us-row-text">${tile('grid', 'gray')}<div class="us-row-copy"><span class="us-row-title">Planları karşılaştır</span><span class="us-row-desc">Ücretsiz, Descall+ ve Ultra yan yana</span></div></div><div class="us-row-control">${svg('chev', 16)}</div></div></div>
          <div class="us-card stack"><div class="us-row"><div class="us-row-text">${tile('ticket', 'gray')}<div class="us-row-copy"><span class="us-row-title">Kupon kodu kullan</span><span class="us-row-desc">Bir kodun varsa buradan gir</span></div></div><div class="us-row-control">${svg('chev', 16)}</div></div></div>
        </div></section>` };
    },
    a2() {
      const row = (n, t, d, on, extra = '') => `<div class="us-row"><div class="us-row-text">${tile(n, 'green')}<div class="us-row-copy"><span class="us-row-title">${t}</span><span class="us-row-desc">${d}</span></div></div><div class="us-row-control">${extra}${tg(on)}</div></div>`;
      return { title: 'Ses', back: true, html: `
        <p class="us-lead">Mikrofonun ve kulaklığın için gelişmiş ayarlar. 8 özellikten 4'ü açık.</p>
        <section class="us-section"><div class="us-card stack">
          ${row('sliders', 'Gürültü kapısı', 'Arka plan gürültüsü için kendi eşiğini ayarla.', true)}
          <div class="dpx-sub">
            <div style="display:flex;justify-content:space-between;font-size:13px"><b>Eşik</b><span style="opacity:.6">-48 dB · konuşurken yeşil</span></div>
            <div class="dpx-meter"><i></i><b></b></div>
            <div class="dpx-scale"><span>Sessiz</span><span>Eşiği sürükle</span><span>Yüksek</span></div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px"><div><div style="font-size:14px;font-weight:600">Kapanma süresi</div><div style="font-size:12.5px;opacity:.6">Konuşma bitince ses ne kadar sonra kesilsin</div></div>
              <div class="us-btn-row"><button class="us-btn ghost">100 ms</button><button class="us-btn primary">250 ms</button><button class="us-btn ghost">500 ms</button></div></div>
          </div>
          ${row('mic', 'Mikrofon ön ayarları', 'Mikrofon ayarlarını kaydet ve değiştir.', true)}
          ${row('vol', 'Mikrofon dinleme', 'Kendi mikrofonunu duy.', false)}
          ${row('sliders', 'Ses etkinliği göstergesi', 'Sesinin ne kadar yüksek olduğunu anlık gör.', true)}
          ${row('zap', 'Otomatik cihaz geçişi', 'Yeni bir kulaklık takınca hemen ona geç.', true)}
          ${row('vol', 'Ses yönlendirme', 'Aramaları ve sesleri farklı çıkışlara gönder.', false)}
          ${row('sliders', 'Ses cihazı profilleri', 'Her kulaklık için ayarları hatırla.', false)}
          ${row('monitor', 'Yayın sesi kontrolü', 'Yayınının nasıl duyulacağını seç.', false, '<span class="dpx-tag" style="margin-right:10px">Ultra</span>')}
        </div></section>` };
    },
    b1(plan = 'plus') {
      const isPlus = plan === 'plus';
      const cats = CATS.map((c) => {
        const locked = isPlus && c.ultra;
        const all = isPlus ? c.plus : c.all;
        return `<div class="dpx-catrow${c.k === 'key' ? ' on' : ''}${locked ? ' dim' : ''}">${tile(c.k, c.c)}${c.name}<span class="n">${locked ? svg('lock', 13) : `${Math.min(c.on, all)}/${all}`}</span></div>`;
      }).join('');
      const row = (n, t, d, on) => `<div class="us-row"><div class="us-row-text">${tile(n, 'indigo')}<div class="us-row-copy"><span class="us-row-title">${t}</span><span class="us-row-desc">${d}</span></div></div><div class="us-row-control">${tg(on)}<span style="opacity:.4;margin-left:10px;display:inline-flex">${svg('chev', 16)}</span></div></div>`;
      return { title: 'Descall+', html: `
        <div class="us-card dpx-strip" style="background:linear-gradient(90deg,rgba(155,140,255,.16),rgba(88,122,246,.08) 60%,rgba(255,255,255,.03))!important;box-shadow:inset 0 0 0 1px rgba(155,140,255,.24)!important">
          ${badge('plus', 'chip')}<div class="t"><b>Descall+</b><small>31 özellik · 6 Ocak 2027'ye kadar</small></div>
          <div class="kv"><div><small>Sonraki hediye</small><b><span class="dpx-coin"></span>5.000 · 6 Ara</b></div><div><small>Açık</small><b>17 / 31</b></div><button class="us-btn ghost">Planlar</button></div>
        </div>
        <div class="dpx-cols">
          <div>
            <div class="dpx-search" style="margin-bottom:10px">${svg('search', 16)}Ara</div>
            <div class="us-card stack" style="padding:0;overflow:hidden">${cats}</div>
            <div class="us-card stack" style="padding:0;overflow:hidden;margin-top:10px"><div class="dpx-catrow">${tile('ticket', 'gray')}Kupon kodu</div></div>
          </div>
          <div>
            <h4 class="us-section-label" style="margin-top:0">Kısayollar · 3 / 6 açık</h4>
            <div class="us-card stack">
              ${row('mic', 'Genel bas-konuş', 'Diğer uygulamalardayken de çalışır. Şu an: Fare 4', true)}
              ${row('vol', 'Genel sessize alma', 'Her yerden tek kısayolla. Şu an: Ctrl + Shift + M', true)}
              ${row('key', 'Özel kısayollar', 'Kendi klavye kısayollarını seç.', true)}
              ${row('sliders', 'Medya tuşları', 'Aramalar için medya tuşlarını kullan.', false)}
              ${row('search', 'Hızlı başlatıcı', 'Tek kısayolla herhangi bir sohbete geç.', false)}
              ${row('bell', 'Hızlı yanıt', "Descall'ı açmadan bildirimden yanıtla.", false)}
            </div>
            <h4 class="us-section-label">Ultra ile açılır</h4>
            <div class="us-card stack" style="opacity:.65"><div class="us-row"><div class="us-row-text">${tile('vol', 'gray')}<div class="us-row-copy"><span class="us-row-title">Kişi başı ses kısayolları</span><span class="us-row-desc">Birinin sesini bir kısayolla değiştir.</span></div></div><div class="us-row-control"><span class="dpx-tag">${svg('lock', 11)}Ultra</span></div></div></div>
          </div>
        </div>` };
    },
    b2() {
      const base = DRAFTS.b1('ultra');
      const html = base.html
        .replace('rgba(155,140,255,.16)', 'rgba(242,170,96,.16)').replace('rgba(155,140,255,.24)', 'rgba(255,200,120,.24)')
        .replace(badge('plus', 'chip'), badge('ultra', 'chip'))
        .replace('<b>Descall+</b><small>31 özellik · 6 Ocak 2027\'ye kadar</small>', '<b>Descall Ultra</b><small>47 özellik · Süresiz</small>')
        .replace('5.000 · 6 Ara', '15.000 · 6 Ara').replace('17 / 31', '18 / 47');
      const drawer = `<div class="dpx-scrim"></div><div class="dpx-drawer">
        <div class="dh">${tile('monitor', 'orange')}<div><b style="font-size:16px">Oyun HUD'u</b><div style="font-size:12.5px;opacity:.6">Ultra · Masaüstü uygulamasında çalışır</div></div><span class="x">${svg('x', 15)}</span></div>
        <div class="dpx-prev"><div class="dpx-hud"><b>Sesli · Ekip</b><br><span class="g">Ayşe konuşuyor</span><br>Gecikme 38 ms · 21:42<br>4 arkadaş çevrimiçi</div><span class="l">Önizleme</span></div>
        <div class="us-card stack">
          <div class="us-row"><div class="us-row-copy"><span class="us-row-title">Açık</span><span class="us-row-desc">Oyun açıkken HUD görünsün</span></div><div class="us-row-control">${tg(true)}</div></div>
          <div class="us-row"><div class="us-row-copy"><span class="us-row-title">Konum</span></div><div class="us-row-control"><div class="dpx-corners"><span></span><span class="on"></span><span></span><span></span></div></div></div>
          <div class="us-row"><div class="us-row-copy"><span class="us-row-title">Saydamlık</span><span class="us-row-desc">%70</span></div><div class="us-row-control"><div class="dpx-slider"><i></i></div></div></div>
          <div class="us-row" style="flex-direction:column;align-items:flex-start;gap:10px"><div class="us-row-copy"><span class="us-row-title">Gösterilenler</span></div><div class="us-btn-row"><button class="us-btn primary">Arama</button><button class="us-btn primary">Saat</button><button class="us-btn primary">Gecikme</button><button class="us-btn ghost">Arkadaşlar</button></div></div>
        </div>
        <div class="dpx-note">${svg('info', 14)}HUD oyunun içine girmez, oyunun üstünde ayrı bir pencerede durur. Tam ekran (exclusive) modda görünmez.</div>
      </div>`;
      return { title: 'Descall+', html: html.replace("Kısayollar · 3 / 6 açık", "Kısayollar · 3 / 7 açık"), overlay: drawer };
    },
    c1() {
      const q = (n, c, t, s, on) => `<div class="us-card dpx-qt"><div class="r">${tile(n, c)}${tg(on)}</div><div><b>${t}</b><small>${s}</small></div></div>`;
      return { title: 'Descall+', html: `
        <div class="dpx-tabs"><span class="on">Genel bakış</span><span>Özellikler</span><span>Planlar</span></div>
        <section class="us-section"><div class="us-card dpx-hero" style="grid-template-columns:1fr">
          <div><h2>Descall Ultra ${badge('ultra', 'inline')}</h2><div class="sub">Süresiz · 47 özelliğe erişimin var · Descall ekibi tarafından verildi</div></div>
          <div class="dpx-tl">
            <div class="done"><i></i><b>6 Kasım</b>15.000 DesCoin alındı</div>
            <div class="next"><i></i><b>6 Aralık</b>15.000 · 30 gün kaldı</div>
            <div><i></i><b>5 Ocak</b>15.000</div>
            <div style="flex:.35"><i></i><b>4 Şubat</b></div>
          </div>
        </div></section>
        <section class="us-section"><h4 class="us-section-label">Sık kullanılanlar</h4>
          <div class="dpx-quick">
            ${q('mic', 'indigo', 'Genel bas-konuş', 'Fare 4', true)}
            ${q('win', 'blue', 'Mini mod', 'Ctrl + Shift + D', true)}
            ${q('bell', 'red', 'Odak modu', 'Kapalı', false)}
            ${q('monitor', 'orange', "Oyun HUD'u", 'Sağ üst köşe', true)}
            ${q('sliders', 'green', 'Gürültü kapısı', '-48 dB', true)}
            ${q('clip', 'orange', 'Anlık klip', 'Son 30 saniye', false)}
          </div>
        </section>
        <section class="us-section"><div class="dpx-two">
          <div><h4 class="us-section-label">Masaüstü uygulaması</h4><div class="us-card stack"><div class="us-row"><div class="us-row-text">${tile('monitor', 'gray')}<div class="us-row-copy"><span class="us-row-title">Bağlı · 3.7.35</span><span class="us-row-desc">Masaüstü özellikleri bu bilgisayarda çalışıyor</span></div></div><div class="us-row-control"><span class="us-online-dot">Açık</span></div></div></div></div>
          <div><h4 class="us-section-label">Kupon kodu</h4><div class="us-card dpx-redeem"><div class="dpx-search">Kupon kodu</div><button class="us-btn primary">Kullan</button></div></div>
        </div></section>` };
    },
    c2() {
      const r = (n, lab, f, p, u, ux = '', last = '') => `<div class="lab ${last}">${svg(n, 15)}${lab}</div><div class="${f === '—' ? 'no' : 'yes'} ${last}">${f}</div><div class="${p === '—' ? 'no' : p === 'Dahil' ? 'yes' : ''} ${last}"><b>${p}</b></div><div class="cur ${u === 'Dahil' ? 'yes' : ''} ${last}"><b>${u}</b>${ux ? `<small class="x">${ux}</small>` : ''}</div>`;
      return { title: 'Descall+', html: `
        <div class="dpx-tabs"><span>Genel bakış</span><span>Özellikler</span><span class="on">Planlar</span></div>
        <section class="us-section"><div class="us-card" style="padding:0;overflow:hidden"><div class="dpx-plans">
          <div class="h"><b>Planlar</b><small>Kategori başına özellik sayısı</small></div>
          <div class="h"><b>Ücretsiz</b><small>Bugün kullandığın her şey</small></div>
          <div class="h">${badge('plus', 'chip')}<small>31 özellik · 30 günde 5.000 DesCoin</small></div>
          <div class="h cur"><span style="display:flex;gap:8px;align-items:center">${badge('ultra', 'chip')}<span class="dpx-cur">Senin planın</span></span><small>47 özellik · 30 günde 15.000 DesCoin</small></div>
          ${r('check', 'Aramalar, sohbet, sunucular', 'Dahil', 'Dahil', 'Dahil')}
          ${r('win', 'Pencereler', '—', '8', '12', '+4 Ultra')}
          ${r('key', 'Kısayollar', '—', '6', '7', '+1 Ultra')}
          ${r('bell', 'Bildirimler', '—', '4', '4')}
          ${r('mic', 'Ses', '—', '7', '8', '+1 Ultra')}
          ${r('game', 'Oyun', '—', '2', '5', "HUD'lar, klip")}
          ${r('zap', 'Verimlilik', '—', '4', '4')}
          ${r('layout', 'Masaüstü araçları', '—', '—', '3', 'kenar çubuğu, bileşenler')}
          ${r('wand', 'Otomasyon ve profiller', '—', '—', '4', 'çoklu hesap dahil')}
          ${r('gift', 'DesCoin hediyesi', '—', '5.000', '15.000', '/ 30 gün', 'last')}
        </div></div>
        <p class="us-hint" style="display:flex;gap:8px;align-items:center;margin-top:12px">${svg('info', 15)}Üyelikler şu an Descall ekibi tarafından veriliyor. Üyelik satın alma henüz yok.</p>
        </section>` };
    },
  };

  window.__dpxDraft = function (id) {
    if (!document.getElementById('dpx-css')) {
      const st = document.createElement('style'); st.id = 'dpx-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const mark = document.querySelector('.dsc-premium-badge-mark');
    if (mark && !STAR) STAR = mark.innerHTML;
    const d = DRAFTS[id]();
    const scroll = document.querySelector('.us-main-scroll');
    const body = document.querySelector('.us-main-body');
    scroll.querySelector('.us-page-title').textContent = d.title;
    scroll.querySelector('.us-tab').innerHTML = d.html;
    scroll.scrollTop = 0;
    document.querySelectorAll('.dpx-scrim,.dpx-drawer,.dpx-back').forEach((n) => n.remove());
    if (d.back) scroll.querySelector('.us-page-title').insertAdjacentHTML('beforebegin', `<div class="dpx-back">${svg('back', 16)}Descall+</div>`);
    const bk = scroll.querySelector('.dpx-back'); const tt = scroll.querySelector('.us-page-title');
    if (bk && tt) bk.style.marginLeft = (tt.getBoundingClientRect().left - bk.getBoundingClientRect().left) + 'px';
    if (d.overlay) {
      const pane = scroll.closest('.us-main') || body.parentElement || body;
      if (getComputedStyle(pane).position === 'static') pane.style.position = 'relative';
      pane.insertAdjacentHTML('beforeend', d.overlay);
    }
    const nav = document.querySelector('.s3-row[data-nav="premium"]');
    if (nav) nav.scrollIntoView({ block: 'center' });
  };
})();
