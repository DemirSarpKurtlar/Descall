import { phone, tabBar, listHeader, av, gav, AV, I, L, GROUP_GRAD, meBtn, bgroup } from "./shared.mjs";
const S = {};

const grow = (icon, color, label, hint = "", trailing = `<span class="chev">${I.chevR}</span>`) => `
  <div class="grow">${icon ? `<div class="gi" style="background:${color}">${icon}</div>` : ""}
    <span class="lbl"><b>${label}</b>${hint ? `<em>${hint}</em>` : ""}</span>${trailing}</div>`;

// ── 15 Settings (UserPanel) ──
S["15-settings"] = phone(`
  <div class="content" style="padding-top:180px">
    <div class="row glass" style="padding:14px;margin-bottom:18px;border-radius:22px">
      ${av("me", 52, "online")}
      <div class="body"><div class="t">Demir Sarp</div><div class="s">@demir · <span style="color:var(--gold)">◈ 1.240 DesCoin</span></div></div>
      <span class="chev" style="color:var(--t3)">${I.chevR}</span>
    </div>
    <div class="sect"><span>Hesap</span></div>
    <div class="group" style="background:rgba(255,255,255,0.06)">
      ${grow(I.user, "#587AF6", "Hesabım", "Kullanıcı adı, e-posta ve durum")}
      ${grow(I.type, "#0a84ff", "Profil", "Avatar, banner ve biyografi")}
      ${grow(I.shield, "#30D158", "Güvenlik", "E-posta, 2FA, oturumlar ve engelleme")}
    </div>
    <div class="sect" style="margin-top:16px"><span>Uygulama</span></div>
    <div class="group" style="background:rgba(255,255,255,0.06)">
      ${grow(I.palette, "#bf5af2", "Görünüm", "Tema ve görünüm")}
      ${grow(I.bell, "#ff453a", "Bildirimler", "Uyarılar ve sesler")}
      ${grow(I.globe, "#64d2ff", "Dil", "İngilizce / Türkçe", `<span class="val">Türkçe</span>`)}
    </div>
    <div class="sect" style="margin-top:16px"><span>Medya</span></div>
    <div class="group" style="background:rgba(255,255,255,0.06)">
      ${grow(I.mic, "#0a84ff", "Ses ve Görüntü", "Cihazlar ve mikrofon testi")}
      ${grow(I.volume, "#ff9f0a", "Ses Efektleri", "Mesaj ve arama sesleri")}
    </div>
    <div class="sect" style="margin-top:16px"><span>Kişiselleştirme</span></div>
    <div class="group" style="background:rgba(255,255,255,0.06)">
      ${grow(I.bag, "#f0b232", "Mağaza", "Banner, çerçeve ve arka planlar")}
    </div>
    <div class="group noicon" style="background:rgba(255,255,255,0.06);margin-top:16px;margin-bottom:110px">
      <div class="grow"><span class="lbl"><b style="color:#ff6961">Çıkış Yap</b></span>${I.logout}</div>
    </div>
  </div>
  <div class="edge-top" style="height:190px"></div>
  <div class="toolbar">${meBtn("online")}<div class="sp"></div></div>
  <h1 class="large-title">Ayarlar</h1>
  <div class="edge-bot"></div>
  ${tabBar(null)}`);

// ── 15b Notifications ──
S["15b-settings-notifications"] = phone(`
  <div class="edge-top" style="height:130px"></div>
  <div class="toolbar">
    <div class="cbtn glass">${I.back}</div>
    <div class="sp"></div>
    <div class="inline-title">Bildirimler</div>
    <div class="sp"></div>
    <div style="width:44px"></div>
  </div>
  <div class="content" style="padding-top:124px">
    <p style="font-size:15px;color:var(--t2);line-height:20px;margin-bottom:16px">Masaüstü ve tarayıcı uyarılarını yönet.</p>
    <div class="group noicon" style="background:rgba(255,255,255,0.06)">
      <div class="grow"><span class="lbl"><b>Mesaj bildirimleri</b><em>DM, grup mesajları ve bahsetmeler</em></span><div class="toggle on"></div></div>
      <div class="grow"><span class="lbl"><b>Arama bildirimleri</b><em>Gelen sesli ve görüntülü aramalar</em></span><div class="toggle on"></div></div>
    </div>
    <div class="card pad" style="margin-top:14px;display:flex;align-items:center;gap:12px">
      <div class="av sq" style="--s:40px;background:rgba(255,69,58,0.2);color:#ff6961">${I.smartphone}</div>
      <div style="flex:1"><div style="font-size:14px;font-weight:650">iPhone bildirimleri kapalı</div>
        <div style="font-size:12.5px;color:var(--t3);margin-top:2px;line-height:16px">Ayarlar → Descall → Bildirimler</div></div>
      <div class="btn sm tint-brand">İzin Ver</div>
    </div>
    <div class="sect" style="margin-top:20px"><span>Aktivite durumu</span></div>
    <div class="group noicon" style="background:rgba(255,255,255,0.06)">
      <div class="grow"><span class="lbl"><b>Oyun aktivitesi</b><em>Arkadaşların oynadığın oyunu görsün</em></span><div class="toggle on"></div></div>
      <div class="grow"><span class="lbl"><b>Uygulama aktivitesi</b><em>Açık uygulamalarını paylaş</em></span><div class="toggle"></div></div>
      <div class="grow"><span class="lbl"><b>Tarayıcı aktivitesi</b><em>Web'de olduğunda göster</em></span><div class="toggle"></div></div>
      <div class="grow"><span class="lbl"><b>Descall kullanım süresi</b><em>Geçirilen süreyi takip et</em></span><div class="toggle on"></div></div>
    </div>
  </div>`);

// ── 16 Announcements ──
S["16-notifications"] = phone(`
  <div class="content" style="filter:blur(3px) brightness(0.5)">
    <div class="sect"><span>Sohbetler</span></div>
    <div class="row">${av("ayse", 52, "online")}<div class="body"><div class="t">Ayşe Yılmaz</div><div class="s">Tamam, 9'da Lobi'de</div></div></div>
  </div>
  ${listHeader({ title: "Sohbetler", buttons: ["search", ["megaphone", { badge: 2 }], "feedback"] })}
  ${tabBar("chat")}
  <div class="scrim"></div>
  <div class="sheet glass heavy" style="bottom:auto;top:14%;left:14px;right:14px;max-height:72%">
    <div class="sheet-h"><div><h3>📢 Duyurular</h3></div><div class="cbtn glass-chip" style="width:34px;height:34px;border-radius:17px">${I.x}</div></div>
    ${[
      [I.bell, "var(--brand)", "2.9.147 yayında", "Kaydırarak geri gitme ve glass mobil cilası.", "2sa"],
      [I.bag, "#7c5cff", "Mağaza güncellemesi", "Yeni aura ve çerçeveler DesCoin ile.", "1g"],
      [I.users, "#30D158", "Topluluk kuralları", "Lütfen arkadaşlık isteklerinde kibar olun.", "3g"],
    ].map(([ic, c, t, s, time]) => `
      <div class="row" style="background:rgba(255,255,255,0.05);border-radius:16px;margin-bottom:8px;min-height:0;padding:12px">
        <div class="av sq" style="--s:40px;background:${c}">${ic}</div>
        <div class="body"><div class="t" style="font-size:15px">${t}</div><div class="s" style="white-space:normal">${s}</div></div>
        <span class="time">${time}</span>
      </div>`).join("")}
  </div>`);

// ── 17 Play (ValorantHub — full screen, back to Descall, no tab bar) ──
S["17-play"] = phone(`
  <div class="edge-top" style="height:150px"></div>
  <div class="toolbar">
    <div class="cbtn glass">${I.arrowL}</div>
    <div style="flex:1;min-width:0;margin-left:4px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:#ff4655;text-transform:uppercase">VALORANT</div>
      <div style="font-size:20px;font-weight:700;letter-spacing:-0.022em;line-height:24px">Valorant</div>
    </div>
    <div class="cbtn glass tint-brand">${I.plus}</div>
  </div>
  <div style="position:absolute;top:116px;left:16px;right:16px;z-index:60" class="seg glass" >
    <div style="gap:6px">${I.star}Companion</div>
    <div class="lens" style="gap:6px">${I.globe}LFG</div>
  </div>
  <div class="content" style="padding-top:172px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;color:var(--t2);font-weight:600">Valorant LFG · Takım bul</div>
      <div class="btn sm tint-brand">${I.plus} Oluştur</div>
    </div>
    <div class="chips" style="margin-bottom:14px">
      <div class="chip on">Tüm modlar</div>
      <div class="chip">EU</div>
      <div class="chip">${I.mic} Mikrofon</div>
      <div class="chip">Gold+</div>
    </div>
    ${[
      ["Competitive", "Duo ranked akşam", "Gold 2 · EU · Mikrofon zorunlu", "ayse", "Ayşe Yılmaz", "2/5", "var(--brand-soft)", "#a8b9ff"],
      ["Unrated", "Chill unrated", "Silver–Gold · EU", "burak", "Burak Ö.", "1/5", "rgba(52,199,89,0.2)", "#30D158"],
      ["Swiftplay", "Hızlı 2-3 maç", "Her rank · EU", "elif", "Elif +2", "3/5", "rgba(255,159,10,0.2)", "#ff9f0a"],
    ].map(([mode, title, meta, k, who, slots, bg, fg]) => `
      <div class="glass" style="padding:14px;border-radius:20px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="display:inline-flex;padding:4px 10px;border-radius:8px;background:${bg};color:${fg};font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase">${mode}</span>
          <span class="chip" style="height:26px">${slots}</span>
        </div>
        <div style="font-size:17px;font-weight:700;margin-top:8px;letter-spacing:-0.018em">${title}</div>
        <div style="font-size:13px;color:var(--t2);margin-top:4px">${meta}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:12px">${av(k, 28, "online")}<span style="font-size:13px;flex:1">${who}</span>
          <div class="btn sm tint-brand">Katıl</div></div>
      </div>`).join("")}
  </div>`);

// ── 18 Status picker (from rail avatar) ──
S["18-status"] = phone(`
  <div class="content" style="filter:blur(2px) brightness(0.45)">
    <div class="sect"><span>Sohbetler</span></div>
    <div class="row">${av("ayse", 52, "online")}<div class="body"><div class="t">Ayşe Yılmaz</div></div></div>
  </div>
  ${listHeader({ title: "Sohbetler", buttons: ["search", "megaphone", "feedback"] })}
  ${tabBar("chat")}
  <div class="scrim"></div>
  <div class="menu glass heavy" style="left:16px;bottom:100px;width:280px;padding:8px">
    <div class="mhead">Durum ayarla</div>
    ${[
      ["#30D158", "Çevrimiçi", true],
      ["#FFD60A", "Boşta", false],
      ["#FF453A", "Rahatsız Etme", false],
      ["#8E8E93", "Görünmez", false],
    ].map(([c, l, on]) => `
      <div class="mi ${on ? "on" : ""}"><span style="width:12px;height:12px;border-radius:50%;background:${c};box-shadow:0 0 0 3px ${c}33"></span>${l}
        ${on ? `<span class="r" style="color:var(--brand)">${I.check}</span>` : ""}</div>`).join("")}
    <div class="msep"></div>
    <div class="mhead">Özel durum</div>
    <div class="field-in" style="margin:4px 8px 8px;height:44px"><span style="font-size:18px">🔥</span><span class="v">Ranked arıyorum</span></div>
    <div style="display:flex;gap:8px;padding:4px 8px 8px">
      <div class="btn sm tint-brand" style="flex:1">${I.check} Kaydet</div>
      <div class="btn sm fill" style="flex:1">İptal</div>
    </div>
    <div class="msep"></div>
    <div class="mi">${I.settings}Kullanıcı Ayarları</div>
  </div>
  <div style="position:absolute;left:16px;top:60px;z-index:90" class="me-btn glass lens">${av("me", 38, "online")}</div>`);

// ── 19 Calls (CallsView — 5 filters) ──
S["19-calls"] = phone(`
  <div class="content" style="padding-top:210px">
    <div class="sect"><span>Hızlı ara</span><em style="font-style:normal;text-transform:none;letter-spacing:0;font-weight:600;color:var(--t3)">3 çevrimiçi</em></div>
    <div style="display:flex;gap:10px;overflow:hidden;margin-bottom:18px">
      ${[["ayse", "Ayşe"], ["mert", "Mert"], ["elif", "Elif"]].map(([k, n]) => `
        <div class="glass" style="width:88px;padding:12px 8px;border-radius:20px;display:flex;flex-direction:column;align-items:center;gap:8px;flex-shrink:0">
          ${av(k, 44, "online")}
          <span style="font-size:12px;font-weight:600">${n}</span>
          <div style="display:flex;gap:6px"><div class="ib" style="width:30px;height:30px">${I.calls}</div><div class="ib" style="width:30px;height:30px">${I.video}</div></div>
        </div>`).join("")}
    </div>
    <div class="sect"><span>Son</span><em style="font-style:normal;text-transform:none;letter-spacing:0;font-weight:650;color:#ff6961">1 cevapsız</em></div>
    <div class="row">
      ${av("mert", 52, "online")}
      <div class="body"><div class="t">Mert K.</div><div class="s">${I.phoneIn} Gelen · 18 dk · 04:12</div></div>
      <div class="ib">${I.calls}</div><div class="ib">${I.video}</div>
    </div>
    <div class="row">
      ${av("ayse", 52, "online")}
      <div class="body"><div class="t">Ayşe Yılmaz</div><div class="s">${I.phoneOut} Giden · 1 sa · 12:40</div></div>
      <div class="ib">${I.calls}</div><div class="ib">${I.video}</div>
    </div>
    <div class="row">
      ${gav("AE", GROUP_GRAD, 52, "sq")}
      <div class="body"><div class="t" style="color:#ff6961">Akşam Ekibi</div><div class="s" style="color:#ff6961">${I.phoneMissed} Cevapsız grup · 4 kişi · Dün</div></div>
      <div class="ib">${I.calls}</div>
    </div>
    <div class="row">
      ${av("elif", 52, "online")}
      <div class="body"><div class="t">Elif</div><div class="s">${I.video} Görüntülü · Giden · 2g · 08:05</div></div>
      <div class="ib">${I.calls}</div><div class="ib">${I.video}</div>
    </div>
  </div>
  <div class="edge-top" style="height:220px"></div>
  <div class="toolbar">${meBtn()}<div class="sp"></div>${bgroup(["search", "refresh"])}</div>
  <h1 class="large-title" style="top:112px">Aramalar<small>Arkadaşlarını hızlı ara veya son DM & grup aramalarına dön.</small></h1>
  <div class="chips" style="position:absolute;top:178px;left:16px;right:16px;z-index:60">
    <div class="chip">Tümü</div>
    <div class="chip">Cevapsız</div>
    <div class="chip on">Gelen</div>
    <div class="chip">Giden</div>
    <div class="chip">Grup</div>
  </div>
  <div class="edge-bot"></div>
  ${tabBar("calls", { chat: 5, friends: 1 })}`);

// ── 20 Activity ──
S["20-activity"] = phone(`
  <div class="content" style="padding-top:180px">
    <div class="glass" style="padding:16px;border-radius:22px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:12px;font-weight:650;color:var(--t3);letter-spacing:0.04em;text-transform:uppercase">Durumun</div>
          <div style="font-size:13px;color:var(--t3);margin-top:2px">Varlığın ve geçmişin</div>
        </div>
        <div class="chip" style="height:28px;font-size:12px">${I.users} Arkadaşlara görünür</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:14px">
        ${av("me", 44, "online")}
        <div style="flex:1"><div class="t" style="font-size:16px">Çevrimiçi</div><div class="s">🔥 Ranked arıyorum</div></div>
      </div>
      <div class="btn w tint-brand" style="margin-top:14px;height:42px">Durum Ayarla</div>
    </div>
    <div class="seg glass" style="margin-bottom:14px;height:40px">
      <div class="lens" style="gap:6px">${I.activity}Arkadaşlar</div>
      <div style="gap:6px">${I.clock}Geçmiş</div>
    </div>
    <div class="sect"><span>Şu an aktif — 2</span></div>
    <div class="row">
      ${av("ayse", "online" === "online" ? 52 : 52, "online")}
      <div class="body"><div class="t">Ayşe Yılmaz</div><div class="s" style="color:#ff4655">🎮 Valorant · Competitive</div>
        <div class="s dim" style="margin-top:2px">Başlangıç 21 dk önce</div></div>
    </div>
    <div class="row">
      ${av("mert", 52, "online")}
      <div class="body"><div class="t">Mert K.</div><div class="s" style="color:#1DB954">🎧 Spotify · Chill mix</div>
        <div class="s dim" style="margin-top:2px">Başlangıç 8 dk önce</div></div>
    </div>
    <div class="sect" style="margin-top:12px"><span>Çevrimiçi — 2</span></div>
    <div class="row">${av("elif", 52, "online")}<div class="body"><div class="t">Elif</div><div class="s">Çevrimiçi</div></div></div>
    <div class="row">${av("selin", 52, "idle")}<div class="body"><div class="t">Selin A.</div><div class="s dim">Boşta</div></div></div>
  </div>
  ${listHeader({ title: "Aktivite", sub: "Varlığın ve geçmişin", buttons: ["search", "feedback"], search: false, plus: false })}
  <div class="edge-bot"></div>
  ${tabBar("activity", { chat: 5, friends: 1 })}`);

// Fix activity listHeader — need plus as userPlus for add friend
S["20-activity"] = phone(`
  <div class="content" style="padding-top:160px">
    <div class="glass" style="padding:16px;border-radius:22px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:12px;font-weight:650;color:var(--t3);letter-spacing:0.04em;text-transform:uppercase">Durumun</div>
          <div style="font-size:13px;color:var(--t3);margin-top:2px">Varlığın ve geçmişin</div>
        </div>
        <div class="chip" style="height:28px;font-size:12px">${I.users} Arkadaşlara görünür</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:14px">
        ${av("me", 44, "online")}
        <div style="flex:1"><div class="t" style="font-size:16px">Çevrimiçi</div><div class="s">🔥 Ranked arıyorum</div></div>
      </div>
      <div class="btn w tint-brand" style="margin-top:14px;height:42px">Durum Ayarla</div>
    </div>
    <div class="seg glass" style="margin-bottom:14px;height:40px">
      <div class="lens" style="gap:6px">${I.activity}Arkadaşlar</div>
      <div style="gap:6px">${I.clock}Geçmiş</div>
    </div>
    <div class="sect"><span>Şu an aktif — 2</span></div>
    <div class="row">${av("ayse", 52, "online")}
      <div class="body"><div class="t">Ayşe Yılmaz</div><div class="s" style="color:#ff4655">🎮 Valorant · Competitive</div>
        <div class="s dim" style="margin-top:2px">Başlangıç 21 dk önce</div></div>
    </div>
    <div class="row">${av("mert", 52, "online")}
      <div class="body"><div class="t">Mert K.</div><div class="s" style="color:#1DB954">🎧 Spotify · Chill mix</div>
        <div class="s dim" style="margin-top:2px">Başlangıç 8 dk önce</div></div>
    </div>
    <div class="sect" style="margin-top:12px"><span>Çevrimiçi — 2</span></div>
    <div class="row">${av("elif", 52, "online")}<div class="body"><div class="t">Elif</div><div class="s">Çevrimiçi</div></div></div>
    <div class="row">${av("selin", 52, "idle")}<div class="body"><div class="t">Selin A.</div><div class="s dim">Boşta</div></div></div>
  </div>
  <div class="edge-top" style="height:170px"></div>
  <div class="toolbar">${meBtn()}${`<div class="sp"></div>`}${bgroup(["search", "feedback"])}<div class="cbtn glass tint-brand">${I.userPlus}</div></div>
  <h1 class="large-title" style="top:112px">Aktivite<small>Varlığın ve geçmişin</small></h1>
  <div class="edge-bot"></div>
  ${tabBar("activity", { chat: 5, friends: 1 })}`);

// ── 21 Shop / Mağaza — matches ShopPanel mobile: header back+title+X, wallet pill,
// intro, daily reward, InviteCard compact, PROFİL BANNERLARI list cards ──
const coin = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M14.5 9.5a3 3 0 0 0-5 0"/><path d="M9.5 14.5a3 3 0 0 0 5 0"/><path d="M12 7v10"/></svg>`;

const shopHeader = `
  <div class="edge-top" style="height:120px"></div>
  <div class="toolbar" style="justify-content:space-between">
    <div class="cbtn glass">${I.back}</div>
    <div class="inline-title">Mağaza</div>
    <div class="cbtn glass">${I.x}</div>
  </div>`;

const walletPill = `
  <div style="display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border-radius:999px;background:rgba(240,178,50,0.12);box-shadow:inset 0 0 0 1px rgba(240,178,50,0.45),0 4px 16px rgba(240,178,50,0.15);color:#f0b232;font-weight:700;font-size:14px;letter-spacing:-0.01em">
    ${coin}<span>8.325</span><span style="font-size:11px;letter-spacing:0.06em;opacity:0.9">DESCOİN</span>
  </div>`;

const shopItem = (preview, name, rarity, desc, price, owned = false) => `
  <div class="glass" style="display:flex;border-radius:16px;overflow:hidden;margin-bottom:10px;min-height:108px">
    <div style="width:112px;flex-shrink:0;${preview}"></div>
    <div style="flex:1;min-width:0;padding:10px 12px;display:flex;flex-direction:column;justify-content:center;gap:4px">
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <span style="font-size:14px;font-weight:650;letter-spacing:-0.015em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</span>
        <span style="flex-shrink:0;font-size:10px;font-weight:800;letter-spacing:0.06em;padding:2px 7px;border-radius:6px;background:rgba(88,122,246,0.22);color:#a8b9ff;box-shadow:inset 0 0 0 1px rgba(143,166,255,0.35)">${rarity}</span>
      </div>
      <div style="font-size:12px;color:var(--t3);line-height:16px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${desc}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
        ${owned
          ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:650;color:var(--ok)">${I.check} Sahip Olundu</span><div class="btn xs fill">Uygula</div>`
          : `<span style="display:inline-flex;align-items:center;gap:5px;color:#f0b232;font-size:13px;font-weight:700">${coin} ${price}</span><div class="btn xs tint-brand">Satın Al</div>`}
      </div>
    </div>
  </div>`;

S["21-shop"] = phone(`
  ${shopHeader}
  <div class="content" style="padding-top:118px;padding-bottom:40px">
    ${walletPill}
    <p style="font-size:13px;color:var(--t2);line-height:18px;margin:12px 0 14px;letter-spacing:-0.005em">Aramalarda konuşarak, mesajlaşarak ve ekran paylaşarak DesCoin kazan — sonra banner, çerçeve, aura, flare ve daha fazlasına harca.</p>

    <div class="glass" style="padding:14px;border-radius:18px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="color:#ff9f0a;display:flex">${I.flame}</span>
        <div><div style="font-size:15px;font-weight:700">Günlük ödül</div>
          <div style="font-size:12px;color:var(--t3);margin-top:1px">Seri: 0</div></div>
      </div>
      <div class="btn w" style="height:46px;border-radius:14px;background:linear-gradient(135deg,#f0b232,#e08a10);color:#1a1200;box-shadow:0 8px 24px rgba(240,178,50,0.35),inset 0 1px 0 rgba(255,255,255,0.35);font-size:15px;font-weight:700;gap:8px">${coin} 40 DesCoin al</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px">
        ${[["Konuşma","0/30"],["Mesajlar","0/20"],["Ekran","0/10"]].map(([l,v]) => `
          <div style="background:rgba(0,0,0,0.28);border-radius:12px;padding:8px 10px;box-shadow:inset 0 0 0 0.5px rgba(255,255,255,0.08)">
            <div style="font-size:11px;color:var(--t3)">${l}</div>
            <div style="font-size:14px;font-weight:700;margin-top:2px">${v}</div>
          </div>`).join("")}
      </div>
    </div>

    <div class="glass" style="padding:14px;border-radius:18px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="color:#ff8fc1;display:flex">${I.gift}</span>
        <div><div style="font-size:15px;font-weight:700">Arkadaş davet et</div>
          <div style="font-size:12px;color:var(--t3);margin-top:1px">Sen 100 DesCoin · onlar 50 kazanır</div></div>
      </div>
      <div class="field-in" style="height:42px;font-size:13px;margin-bottom:10px;color:var(--t2)">descall.com/register?ref=demir</div>
      <div style="display:flex;gap:8px">
        <div class="btn sm tint-brand" style="flex:1.2">${I.copy} Linki kopyala</div>
        <div class="btn sm fill" style="flex:1">${I.share} Paylaş</div>
      </div>
    </div>

    <div class="chips" style="margin-bottom:12px;overflow:hidden">
      <div class="chip on">${I.image} Bannerlar</div>
      <div class="chip">Çerçeveler</div>
      <div class="chip">Auralar</div>
      <div class="chip">Rozetler</div>
      <div class="chip">Unvanlar</div>
    </div>

    <div class="sect"><span>Profil Bannerları</span></div>
    ${shopItem(
      "background:linear-gradient(145deg,#0d2818 0%,#1a5c3a 40%,#3d8b5f 70%,#0a1f14 100%)",
      "Emerald Forest", "RARE",
      "Deep, mossy greens for a nature-inspired banner.", "280")}
    ${shopItem(
      "background:linear-gradient(145deg,#0a1628 0%,#1a3a6e 35%,#3ecfbf 55%,#7b5cff 75%,#0c1220 100%)",
      "Aurora Borealis", "RARE",
      "A shimmering aurora gradient for your profile banner.", "300")}
  </div>`);

// ── 21b Shop items (scrolled further — more banners + frames) ──
S["21b-shop-items"] = phone(`
  ${shopHeader}
  <div class="content" style="padding-top:118px;padding-bottom:40px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      ${walletPill}
      <div class="chip" style="height:28px;font-size:12px">Bannerlar · 12</div>
    </div>
    <div class="chips" style="margin-bottom:14px">
      <div class="chip on">${I.image} Bannerlar</div>
      <div class="chip">${I.circleDot} Çerçeveler</div>
      <div class="chip">${I.sun} Auralar</div>
      <div class="chip">${I.award} Rozetler</div>
      <div class="chip">${I.sparkles} Parıltılar</div>
    </div>
    <div class="sect"><span>Profil Bannerları</span></div>
    ${shopItem(
      "background:linear-gradient(145deg,#0d2818 0%,#1a5c3a 40%,#3d8b5f 70%,#0a1f14 100%)",
      "Emerald Forest", "RARE",
      "Deep, mossy greens for a nature-inspired banner.", "280")}
    ${shopItem(
      "background:linear-gradient(145deg,#0a1628 0%,#1a3a6e 35%,#3ecfbf 55%,#7b5cff 75%,#0c1220 100%)",
      "Aurora Borealis", "RARE",
      "A shimmering aurora gradient for your profile banner.", "300")}
    ${shopItem(
      "background:linear-gradient(160deg,#1a0a14 0%,#7a1f4a 45%,#ff6b9d 70%,#2a1020 100%)",
      "Neon Sakura", "EPIC",
      "Pink neon blossoms over a midnight city skyline.", "420")}
    ${shopItem(
      "background:linear-gradient(150deg,#05070e 0%,#1a2744 40%,#587AF6 65%,#c9d4ff 85%,#0a0c14 100%)",
      "Descall Horizon", "COMMON",
      "Brand-blue dawn over the Descall skyline.", "120", true)}
    <div class="sect" style="margin-top:8px"><span>Avatar Çerçeveleri</span></div>
    ${shopItem(
      "background:radial-gradient(circle at 50% 50%, transparent 38%, #587AF6 42%, #a8b9ff 52%, transparent 58%), linear-gradient(145deg,#12141c,#1E1F22);display:flex;align-items:center;justify-content:center",
      "Neon Blue", "RARE",
      "Electric blue ring that pulses while you speak.", "180")}
    ${shopItem(
      "background:radial-gradient(circle at 50% 50%, transparent 38%, #f0b232 42%, #ffe08a 52%, transparent 58%), linear-gradient(145deg,#1a1408,#221a0c);display:flex;align-items:center;justify-content:center",
      "Gold Duo", "EPIC",
      "Premium gold frame for your ranked identity.", "240")}
  </div>`);

export default S;
