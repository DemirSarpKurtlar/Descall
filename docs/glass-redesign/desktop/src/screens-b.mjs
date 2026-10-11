import { win, rail, railTip, sideHeader, dmList, chead, peerDm, composer, group, tick, reacts, wave, typing, av, gav, AV, I, L, bgroup, GROUP_GRAD, GROUP2_GRAD, GROUP3_GRAD, GROUP4_GRAD, groupRow } from "./shared.mjs";
const S = {};
const G5 = "linear-gradient(145deg,#5ad1ff,#5a6cff)";

// ── 05 Group chat (GroupList + ChatPanel + members panel + ActiveCallBanner + slash menu) ──
const groupsList = (sel = "ae") => [
  ["AE", GROUP_GRAD, "Akşam Ekibi", "Selin: Süper, PDF’e baktım 👍", "21:18", 0, "ae"],
  ["HS", GROUP2_GRAD, "Hafta Sonu", "Mert: Cumartesi 20:00 olur mu?", "20:40", 5, "hs"],
  ["FG", GROUP3_GRAD, "Film Gecesi", "Selin: Pazar 21:00, ekran paylaşırım 🍿", "Dün", 0, "fg"],
  ["BK", GROUP4_GRAD, "Basketbol", "Kaan: Salı saha bizde", "Pzt", 0, "bk"],
  ["KT", G5, "Kampüs", "Zeynep: Notları paylaştım 📎", "Paz", 0, "kt"],
  ["TK", "linear-gradient(145deg,#9b85ff,#e0508f)", "Turnuva Kadrosu", "Sen: Kadro tamam, cuma görüşürüz", "9 Eki", 0, "tk"],
].map(([l, g, n, p, t, b, id]) => groupRow(l, g, n, p, t, { badge: b, sel: id === sel, hov: id === "hs" })).join("");

const memberRow = (k, status, label, { owner = false, off = false, hov = false, color = "" } = {}) => `
  <div class="mrow ${off ? "off" : ""} ${hov ? "hov" : ""}">${av(k, 36, off ? "off" : status, "", "#1b1d29")}
    <div class="mm"><div class="mn" style="${color ? `color:${color}` : ""}">${AV[k].name}${owner ? `<span class="owner">${I.crown}Sahip</span>` : ""}</div><div class="ms">${label}</div></div></div>`;

const callBanner = `
  <div class="glass" style="position:absolute;z-index:55;top:76px;left:16px;right:16px;height:56px;border-radius:20px;display:flex;align-items:center;gap:12px;padding:0 8px 0 10px">
    <span style="width:38px;height:38px;border-radius:19px;display:flex;align-items:center;justify-content:center;color:#fff" class="tint-green">${I.volume}</span>
    <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:650">Ses Odası <span style="color:var(--t3);font-weight:500">· 3 katılımcı katıldı</span></div><div style="font-size:12px;color:var(--t3)">Ayşe Yılmaz başlattı</div></div>
    <div style="display:flex">${["ayse", "mert", "elif"].map((k, i) => `<span style="margin-left:${i ? -8 : 0}px;border-radius:50%;box-shadow:0 0 0 2px #262838">${av(k, 26)}</span>`).join("")}</div>
    <div class="btn sm tint-green">${I.phoneIn}Katıl</div>
    <span class="xbtn" title="Kapat">${I.x}</span>
  </div>`;

const slashMenu = `
  <div class="menu glass heavy" style="left:20px;right:20px;bottom:${16 + 52 + 10}px;padding:8px">
    <div class="mhead">Komutlar</div>
    ${[["coins", "/coinflip", "Yazı tura at. Sona heads, h, tails veya t yaz.", "Yazı tura", true], ["coins", "/cf", "Yazı tura at. /coinflip ile aynı.", "Yazı tura"], ["wallet", "/credits", "Casino kredini kontrol et.", "Kredi"]].map(([ic, c, h, l, on]) => `
      <div class="mi ${on ? "hov" : ""}" style="height:52px;gap:12px"><span class="gi" style="background:rgba(88,122,246,0.24);color:var(--brand-hi)">${ic === "wallet" ? L("wallet") : I[ic]}</span>
        <span style="display:flex;flex-direction:column;gap:1px"><b style="font-size:14px;font-weight:650">${c}</b><span style="font-size:12px;color:var(--t3)">${h}</span></span><span class="r" style="font-size:12px;font-weight:600">${l}</span></div>`).join("")}
  </div>`;

S["05-group"] = win(`
  <div class="app">
    ${rail("groups", { badges: { chat: 3, groups: 5 } })}
    <aside class="side glass panel">
      ${sideHeader("Gruplar")}
      <div class="side-body"><div class="sect">Gruplar<span class="sp"></span>${I.chevD}</div>${groupsList()}</div>
    </aside>
    <main class="main">
      <div class="msgs" style="bottom:84px">
        <div class="daysep">Bugün</div>
        ${group("mert", "20:10", ["Bu akşam ranked mi?"], { status: "idle" })}
        ${group("ayse", "20:11", ["Evet, 21:00’de ses odasındayız. Kadroyu sabitledim 📌"], { status: "online", extraAfter: reacts([["👍", 3, true], ["🔥", 1]]) })}
        ${group("elif", "20:12", ["Ben hazırım 🎯"], { status: "online" })}
        ${group("burak", "20:14", [{ html: `Yeni crosshair ayarım, nasıl?<div class="media" style="margin-top:8px;width:300px;height:150px;background:radial-gradient(60% 80% at 30% 30%,#2b7a6f,transparent 70%),radial-gradient(60% 80% at 80% 80%,#3b3b8f,transparent 70%),#151a24"><svg viewBox="0 0 300 150" style="position:absolute;inset:0"><g stroke="#4dff9a" stroke-width="2"><path d="M150 62v12M150 86v12M132 80h12M156 80h12"/></g></svg><span class="gif">PNG</span></div>` }], { status: "off" })}
        ${group("me", "20:16", [{ html: `<div class="filec"><span class="fi">${I.file}</span><div><b>turnuva-kadro.pdf</b><em>184 KB · Dosya</em></div></div>${tick()}` }], { own: true, status: "online" })}
        ${group("selin", "21:18", [{ html: `<div class="rq"><b>Demir</b><span>turnuva-kadro.pdf</span></div>Süper, PDF’e baktım 👍` }], { status: "off" })}
        ${typing("mert", "Mert K. ve Elif yazıyor")}
      </div>
      ${chead({ left: `<div class="peer glass">${gav("AE", GROUP_GRAD, 40)}<div><div class="nm">Akşam Ekibi</div><div class="sb dim">6 üye</div></div></div>`,
        buttons: [["search", { t: "Ara" }], ["users", { t: "Üyeler", on: true }], ["pin", { t: "Sabitlenmiş mesajlar", badge: 1 }], ["calls", { t: "Sesli Arama" }], ["video", { t: "Görüntülü Arama" }]] })}
      ${callBanner}
      ${composer({ text: "/c" })}
      ${slashMenu}
    </main>
    <aside class="mem glass panel">
      <div class="mem-h"><h4>Üyeler<span class="n">6</span></h4><span class="xbtn">${I.x}</span></div>
      <div class="side-body" style="padding-top:4px">
        <div class="sect">Çevrimiçi — 4</div>
        ${memberRow("ayse", "online", "Çevrimiçi", { owner: true })}
        ${memberRow("me", "online", "Çevrimiçi", { hov: true })}
        ${memberRow("elif", "online", "Çevrimiçi")}
        ${memberRow("mert", "idle", "Boşta")}
        <div class="sect" style="margin-top:8px">Çevrimdışı — 2</div>
        ${memberRow("burak", "off", "Çevrimdışı", { off: true })}
        ${memberRow("selin", "off", "Çevrimdışı", { off: true })}
      </div>
    </aside>
  </div>`);

// ── Server shell (06 / 07 / 09) ──
const SERVERS = [["AE", GROUP_GRAD], ["OG", "linear-gradient(145deg,#2d6a4f,#1a3d30)"], ["KT", "linear-gradient(145deg,#c25757,#7a2a2a)"], ["FR", "linear-gradient(145deg,#d6457a,#7a2a6f)"]];
const serverRail = (active = 0) => `
  <div style="width:64px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px 0 12px;border-right:0.5px solid rgba(255,255,255,0.08)">
    ${SERVERS.map(([lab, g], i) => `<div style="position:relative">${i === active ? `<span style="position:absolute;left:-12px;top:10px;width:4px;height:24px;border-radius:2px;background:#fff"></span>` : i === 1 ? `<span style="position:absolute;left:-12px;top:18px;width:4px;height:8px;border-radius:2px;background:rgba(255,255,255,0.7)"></span>` : ""}
      <div class="av sq" style="--s:44px;background:${g};font-size:14px;${i === active ? "box-shadow:0 0 0 2px var(--brand),0 4px 16px rgba(88,122,246,0.45);border-radius:14px" : "border-radius:16px"}">${lab}</div>
      ${i === 2 ? `<span class="badge red" style="position:absolute;right:-5px;bottom:-3px;box-shadow:0 0 0 2px #1e2030">3</span>` : ""}</div>`).join("")}
    <div style="width:24px;height:1px;background:rgba(255,255,255,0.12)"></div>
    <div class="av sq" style="--s:44px;border-radius:16px;border:1.5px dashed rgba(255,255,255,0.28);background:transparent;color:var(--t2);box-shadow:none" title="Sunucu oluştur">${I.plus}</div>
  </div>`;
const cat = (name, { hov = false } = {}) => `<div class="sect" style="padding:14px 6px 4px;${hov ? "color:var(--t1)" : ""}">${I.chevD}<span>${name}</span><span class="sp"></span>${hov ? `<span style="display:flex;gap:6px;color:var(--t2)" title="Kanal oluştur · Kanal erişimi · Kategoriyi düzenle · Kategoriyi sil">${I.plus}${I.lock}${I.settings2}${I.trash}</span>` : ""}</div>`;
const chan = (name, { active = false, voice = false, badge = 0, muted = false, tag = "", hov = false, count = 0 } = {}) => `
  <div style="display:flex;align-items:center;gap:8px;height:34px;padding:0 8px;border-radius:10px;font-size:14px;position:relative;
    color:${active ? "var(--t1)" : muted ? "var(--t4)" : badge ? "var(--t1)" : "var(--t2)"};${active ? "background:rgba(88,122,246,0.24);font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,0.10),inset 0 0 0 0.5px rgba(143,166,255,0.35)" : hov ? "background:rgba(255,255,255,0.06)" : ""};${badge ? "font-weight:600" : ""}">
    ${voice ? I.volume : I.hash}<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</span>
    ${tag ? `<span style="font-size:10px;font-weight:700;opacity:0.75;letter-spacing:0.02em">${tag}</span>` : ""}
    ${muted ? `<span style="color:var(--t4)">${L("bell-off", "sm")}</span>` : ""}
    ${count ? `<span style="font-size:11.5px;color:var(--t3);font-weight:600">${count}</span>` : ""}
    ${badge ? `<span class="badge red">${badge}</span>` : ""}
    ${hov ? `<span class="glass-chip" style="width:24px;height:24px;border-radius:12px;display:flex;align-items:center;justify-content:center" title="Kanal ayarları">${I.moreH}</span>` : ""}
  </div>`;
const vuser = (k, { speaking = false, muted = false, deaf = false, badge = "" } = {}) => `
  <div style="display:flex;align-items:center;gap:8px;height:30px;padding:0 8px 0 30px;font-size:13px;color:var(--t2)">
    <span style="border-radius:50%;${speaking ? "box-shadow:0 0 0 2px #30D158,0 0 10px rgba(48,209,88,0.6)" : ""}">${av(k, 22)}</span>
    <span style="flex:1;${speaking ? "color:var(--t1);font-weight:600" : ""}">${AV[k].name}</span>
    ${badge ? `<span class="ttag" style="background:rgba(255,201,77,0.16);color:var(--gold)">${badge}</span>` : ""}
    ${deaf ? `<span style="color:#ff6961">${L("headphone-off")}</span>` : ""}${muted ? `<span style="color:#ff6961">${L("mic-off")}</span>` : ""}
  </div>`;
function serverSide({ hovChan = "strateji", hovCat = false, voiceActive = false, menuBtnOn = false } = {}) {
  return `
    <aside class="side glass panel" style="flex-direction:row">
      ${serverRail(0)}
      <div style="flex:1;min-width:0;display:flex;flex-direction:column">
        <div style="display:flex;align-items:center;gap:6px;padding:14px 8px 10px 10px">
          <span class="cbtn glass-chip" style="width:30px;height:30px;border-radius:15px" title="Sunuculara dön">${I.arrowL}</span>
          <div style="flex:1;min-width:0;padding-left:4px"><div style="font-size:16px;font-weight:700;letter-spacing:-0.02em;white-space:nowrap">Akşam Ekibi</div><div style="font-size:11.5px;color:var(--t3)">128 üye · Sahip</div></div>
          <span class="cbtn glass-chip" style="width:30px;height:30px;border-radius:15px" title="Kanal oluştur">${I.plus}</span>
          <span class="cbtn glass-chip" style="width:30px;height:30px;border-radius:15px;${menuBtnOn ? "background:rgba(88,122,246,0.32);color:#fff" : ""}" title="Sunucu menüsü">${I.moreH}</span>
        </div>
        <div style="flex:1;overflow:hidden;padding:0 8px">
          ${cat("Bilgi", { hov: hovCat })}
          ${chan("duyurular", { tag: "DUYURU" })}
          ${chan("kurallar", { muted: true })}
          ${cat("Yazı Kanalları")}
          ${chan("genel", { active: !voiceActive })}
          ${chan("strateji", { badge: 4, hov: hovChan === "strateji" })}
          ${chan("klipler")}
          ${chan("meme", { muted: true })}
          ${cat("Ses Kanalları")}
          ${chan("Lobi", { voice: true, count: 4, active: voiceActive })}
          ${vuser("ayse", { speaking: true, badge: voiceActive ? "" : "" })}
          ${vuser("mert", { muted: true })}
          ${vuser("elif")}
          ${voiceActive ? vuser("me", {}) : vuser("burak", { deaf: true, muted: true })}
          ${chan("Ranked", { voice: true, count: 2 })}
          ${vuser("can", {})}${vuser("kaan", { speaking: false })}
          ${chan("AFK", { voice: true })}
        </div>
      </div>
    </aside>`;
}

const srvMsgs = `
  <div class="daysep">Bugün</div>
  ${group("mert", "20:10", ["Bu akşam ranked mi? 5’lik lazım"], { status: "idle", tag: `<span class="ttag" style="background:rgba(155,133,255,0.18);color:#b9a9ff">MOD</span>` })}
  ${group("ayse", "20:11", ["Evet, Lobi kanalına gelin.", { html: `<div class="code"><span class="lang">js</span><span class="k">const</span> lobby = <span class="s">'Akşam Ekibi'</span>;\n<span class="k">const</span> start = <span class="n">21</span>; <span class="c">// 21:00'da başlıyoruz</span></div>` }], { status: "online", tag: `<span class="ttag" style="background:rgba(255,201,77,0.16);color:var(--gold)">YÖNETİCİ</span>`, extraAfter: reacts([["👍", 3, true], ["🔥", 1]], true) })}
  ${group("elif", "20:12", ["Ben hazırım 🎯 Haritada Ascent mi Lotus mu?"], { status: "online" })}
  ${group("me", "20:14", [{ html: `Geliyorum, 2 dk${tick()}` }], { own: true, status: "online" })}
  ${group("burak", "20:16", [{ html: `<div class="rq"><b>Demir</b><span>Geliyorum, 2 dk</span></div>Ben de, AFK’dan geçiyorum` }], { status: "off" })}
  ${typing("can", "Can Demir yazıyor")}`;

const srvMember = (k, status, label, { owner = false, off = false, color = "", hov = false, timeout = false } = {}) => `
  <div class="mrow ${off ? "off" : ""} ${hov ? "hov" : ""}">${av(k, 34, off ? "off" : status, "", "#1b1d29")}
    <div class="mm"><div class="mn" style="${color ? `color:${color}` : ""}">${AV[k].name}${owner ? `<span class="owner">${I.crown}Sahip</span>` : ""}${timeout ? `<span class="ttag" style="background:rgba(255,69,58,0.16);color:#ff8a82">${L("timer")}</span>` : ""}</div><div class="ms">${label}</div></div></div>`;
const serverMembers = `
    <aside class="mem glass panel">
      <div class="mem-h"><h4>Üyeler<span class="n">128</span></h4><span class="xbtn">${I.x}</span></div>
      <div class="search glass-chip" style="margin:10px 12px 0">${I.search}<span>Üye ara</span></div>
      <div class="side-body" style="padding-top:4px">
        <div class="sect" style="color:#ffc94d">Yönetici — 2</div>
        ${srvMember("me", "online", "Çevrimiçi", { owner: true, color: "#ffd77a" })}
        ${srvMember("ayse", "online", "Çevrimiçi", { color: "#ffd77a", hov: true })}
        <div class="sect" style="color:#b9a9ff;margin-top:4px">Moderatör — 1</div>
        ${srvMember("mert", "idle", "Boşta", { color: "#c9bcff" })}
        <div class="sect" style="margin-top:4px">Çevrimiçi — 6</div>
        ${srvMember("elif", "online", "🎮 Valorant oynuyor")}
        ${srvMember("can", "dnd", "Rahatsız Etme")}
        ${srvMember("kaan", "online", "Çevrimiçi")}
        ${srvMember("zeynep", "online", "📚 Ders çalışıyor")}
        <div class="sect" style="margin-top:4px">Çevrimdışı — 119</div>
        ${srvMember("burak", "off", "Çevrimdışı", { off: true })}
        ${srvMember("selin", "off", "Çevrimdışı", { off: true, timeout: true })}
      </div>
    </aside>`;

function serverScreen({ overlay = "", side = {}, members = true } = {}) {
  return win(`
  <div class="app">
    ${rail("servers", { badges: { chat: 3, groups: 5, servers: 4 }, })}
    ${serverSide(side)}
    <main class="main">
      <div class="msgs">${srvMsgs}</div>
      ${chead({ left: `<div class="peer glass"><span class="hash">${I.hash}</span><div><div class="nm">genel</div><div class="sb dim">Genel sohbet · oyun saatleri burada</div></div></div>`,
        buttons: [["search", { t: "Ara" }], ["users", { t: "Üyeler", on: members }], ["pin", { t: "Sabitlenmiş mesajlar", badge: 2 }]] })}
      ${composer({ placeholder: "#genel'e mesaj yaz…" })}
    </main>
    ${members ? serverMembers : ""}
  </div>${overlay}`);
}
S["06-server"] = serverScreen({});

// ── 07a Server menu (dropdown from ⋯) ──
const serverMenu = `
  <div class="menu glass heavy" style="left:${8 + 72 + 8 + 64 + 8}px;top:${40 + 58}px;width:252px">
    ${[["hash", "Kanal oluştur"], ["folder", "Kategori oluştur"], ["shield", "Roller"], ["link", "Kişi davet et", true], ["settings2", "Sunucu Ayarları"], ["shieldCheck", "Topluluk ve Keşif"], ["camera", "Sunucu ikonunu değiştir"]].map(([ic, l, h]) => `<div class="mi ${h ? "hov" : ""}">${ic === "shieldCheck" ? L("shield-check") : I[ic]}${l}</div>`).join("")}
    <div class="msep"></div>
    <div class="mhead">Bildirim Ayarları</div>
    <div class="mi">${I.bellRing}Tüm mesajlar</div>
    <div class="mi on">${I.bell}Sadece @bahsetmeler<span class="r">${I.check}</span></div>
    <div class="mi">${I.bellOff}Hiçbiri</div>
    <div class="msep"></div>
    <div class="mi">${I.ban}Yasaklar</div>
    <div class="mi">${I.scroll}Denetim kaydı</div>
    <div class="msep"></div>
    <div class="mi danger">${I.trash}Sunucuyu sil</div>
  </div>`;
S["07a-server-menu"] = serverScreen({ overlay: serverMenu, side: { hovChan: null, menuBtnOn: true } });

// ── 07b Server Settings modal ──
const sel = (v) => `<div class="field-in"><span class="v">${v}</span><span class="end">${I.chevD}</span></div>`;
const settingsModal = `
  <div class="scrim"></div>
  <div class="modal glass heavy" style="left:50%;top:calc(50% + 20px);transform:translate(-50%,-50%);width:640px">
    <div class="modal-h"><div style="flex:1"><h3>Sunucu Ayarları</h3><p>Sunucu adı, açıklama, simge ve banner’ı güncelle.</p></div><span class="xbtn">${I.x}</span></div>
    <div style="padding:18px 24px 0">
      <div class="flabel">Banner</div>
      <div style="height:120px;border-radius:18px;position:relative;overflow:hidden;background:radial-gradient(60% 120% at 20% 20%,#6c86ff,transparent 70%),radial-gradient(60% 120% at 90% 80%,#d6457a,transparent 70%),#1d1f33;box-shadow:inset 0 0 0 0.5px rgba(255,255,255,0.14)">
        <div style="position:absolute;right:12px;bottom:12px;display:flex;gap:8px"><span class="btn xs glass-chip">${I.image}Banner'ı değiştir</span><span class="btn xs glass-chip" style="color:#ff8a82">${I.trash}Banner'ı kaldır</span></div>
      </div>
      <div style="display:flex;gap:16px;margin-top:16px;align-items:flex-end">
        <div><div class="flabel">Simge</div><div style="position:relative">${gav("AE", GROUP_GRAD, 76)}<span class="glass-chip" style="position:absolute;right:-4px;bottom:-4px;width:28px;height:28px;border-radius:14px;display:flex;align-items:center;justify-content:center" title="Simgeyi değiştir">${I.camera}</span></div></div>
        <div style="flex:1"><div class="flabel">Sunucu adı</div><div class="field-in focus"><span class="v">Akşam Ekibi</span></div></div>
      </div>
      <div class="flabel" style="margin-top:16px">Açıklama</div>
      <div class="field-in" style="height:64px;align-items:flex-start;padding-top:12px"><span class="v">Her akşam 21:00 ranked, hafta sonu turnuva. Saygılı ol, iyi oyna 🎯</span></div>
      <div class="mhead" style="padding:20px 2px 10px">Sistem kanalları</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 16px">
        <div><div class="flabel">AFK ses kanalı</div>${sel("🔊 AFK")}</div>
        <div><div class="flabel">AFK zaman aşımı (saniye)</div><div class="field-in"><span class="v">300</span></div></div>
        <div><div class="flabel">Sistem kanalı</div>${sel("# duyurular")}</div>
        <div><div class="flabel">Karşılama kanalı</div>${sel("# genel")}</div>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;padding:20px 24px 22px"><span class="btn fill">İptal</span><span class="btn tint-brand">Değişiklikleri Kaydet</span></div>
  </div>`;
S["07b-server-settings"] = serverScreen({ overlay: settingsModal, side: { hovChan: null } });

// ── Video silhouette (no real photos) ──
const room = (a = "#5a3d7a", b = "#2a4f6f", lamp = "rgba(255,200,140,0.55)") => `<div style="position:absolute;inset:0;background:linear-gradient(180deg,${a} 0%,${b} 100%)"></div>
  <div style="position:absolute;inset:0;filter:blur(18px)">
    <div style="position:absolute;left:8%;top:10%;width:18%;height:46%;border-radius:12px;background:rgba(255,255,255,0.10)"></div>
    <div style="position:absolute;right:10%;top:16%;width:22%;height:8%;border-radius:6px;background:rgba(0,0,0,0.25)"></div>
    <div style="position:absolute;right:12%;top:30%;width:18%;height:8%;border-radius:6px;background:rgba(0,0,0,0.22)"></div>
    <div style="position:absolute;right:18%;top:6%;width:120px;height:120px;border-radius:50%;background:${lamp}"></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:22%;background:rgba(0,0,0,0.35)"></div>
  </div>`;
const person = (skin = "#c99a7a", shirt = "#2a3d6b", hair = "#2a1f1a", op = 1) => `
  <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMax meet" style="position:absolute;inset:0;width:100%;height:100%;opacity:${op}">
    <defs><radialGradient id="lt" cx="35%" cy="25%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="sb"><feGaussianBlur stdDeviation="1.2"/></filter></defs>
    <g filter="url(#sb)">
      <path d="M95 300c8-62 52-96 105-96s97 34 105 96z" fill="${shirt}"/>
      <rect x="182" y="168" width="36" height="44" rx="14" fill="${skin}" opacity="0.92"/>
      <ellipse cx="200" cy="132" rx="50" ry="60" fill="${skin}"/>
      <path d="M150 128c-4-46 22-74 52-74 34 0 56 26 50 72-8-24-26-36-50-36-26 0-44 14-52 38z" fill="${hair}"/>
    </g>

  </svg>`;

// ── 08 1:1 call (CallOverlay, DM, wide dock) + Diğer seçenekler ──
const moreMenu = `
  <div class="menu glass heavy" style="right:${(1440 - 0) / 2 - 356}px;bottom:${20 + 76 + 10}px;width:264px">
    ${[["chat", "Sohbet"], ["hand", "El kaldır"], ["volume", "Ses cihazları"], ["sliders", "Ekran kalitesi"], ["videoOff", "Kamerayı kapat"], ["micOff", "Mikrofonu kapat"], ["users", "Katılımcıları göster"], ["copy", "Arama bilgisini kopyala", true]].map(([ic, l, h]) => `<div class="mi ${h ? "hov" : ""}">${I[ic]}${l}</div>`).join("")}
    <div class="msep"></div>
    <div class="mi danger">${I.phoneOff}Aramadan ayrıl</div>
  </div>`;
const dock = ({ group = false, more = false } = {}) => `
  <div class="dock glass heavy">
    <div class="dslot"><span class="cb g" title="Sessiz">${I.mic}</span><span class="chev" title="Ses cihazları">${I.chevU}</span></div>
    <span class="cb g" title="Sağırlaştır">${I.headphones}</span>
    <div class="dslot"><span class="cb on" title="Kamerayı kapat">${I.video}</span><span class="chev" title="Kamera">${I.chevU}</span></div>
    <span class="cb g" title="Ekranı sun">${I.monitor}<span class="qb" title="Ekran kalitesi">${I.sliders}</span></span>
    <span class="cb g" title="El kaldır">${I.hand}</span>
    <span class="cb g" title="Ses cihazları">${I.volume}</span>
    <span class="cb g" title="Diğer seçenekler" style="${more ? "background:rgba(255,255,255,0.24)" : ""}">${I.moreV}</span>
    <span class="dsep"></span>
    <span class="cb end tint-red" title="Aramayı bitir">${I.phoneOff}</span>
  </div>`;
const qHud = `<div class="glass" style="height:44px;border-radius:22px;display:flex;align-items:center;gap:8px;padding:0 14px" title="Bağlantı: Mükemmel"><div class="qbars"><i style="height:4px"></i><i style="height:7px"></i><i style="height:10px"></i><i style="height:13px"></i></div><span style="font-size:13px;font-weight:650">Mükemmel</span></div>`;
const qDetail = `
  <div class="menu glass heavy" style="right:${24 + 148}px;top:${40 + 16 + 52}px;width:220px;padding:12px 14px">
    <div class="mhead" style="padding:0 0 8px">Bağlantı kalitesi</div>
    ${[["Gecikme", "18 ms"], ["Titreşim", "2 ms"], ["Paket kaybı", "%0,0"], ["Bit hızı", "2,4 Mbps"]].map(([a, b]) => `<div style="display:flex;justify-content:space-between;font-size:13px;height:26px;align-items:center"><span style="color:var(--t2)">${a}</span><b style="font-weight:650;font-variant-numeric:tabular-nums">${b}</b></div>`).join("")}
  </div>`;
S["08-call-1on1"] = win(`
  <div class="call-bg" style="top:40px"></div>
  <div style="position:absolute;top:56px;left:24px;right:24px;height:52px;z-index:60;display:flex;align-items:center;gap:10px">
    <div class="peer glass">${av("ayse", 40, "online", "", "#2a2c3d")}<div><div class="nm">Ayşe Yılmaz</div><div class="sb dim" style="font-variant-numeric:tabular-nums">04:12 · Görüntülü arama</div></div></div>
    <div style="flex:1"></div>
    ${qHud}
    ${bgroup([["users", { t: "Katılımcıları göster" }], ["chat", { t: "Sohbet" }], ["minus", { t: "Küçült" }]]).replace('class="bgroup glass "', 'class="bgroup glass" style="height:44px;border-radius:22px"')}
  </div>
  ${qDetail}
  <div class="tile speaking vid-b" style="position:absolute;left:24px;right:24px;top:124px;bottom:116px;z-index:10">
    ${room()}${person("#d8a487", "#3b2a5e", "#3a2418")}
    <div class="lbl glass"><span class="sd"></span>Ayşe Yılmaz</div>
  </div>
  <div class="tile vid-self" style="position:absolute;right:48px;bottom:140px;width:256px;height:160px;z-index:20;box-shadow:inset 0 0 0 0.5px rgba(255,255,255,0.2),0 18px 40px rgba(0,0,0,0.5)">
    ${room("#1f2a44", "#16202f", "rgba(140,180,255,0.45)")}${person("#c58f6c", "#1f3357", "#1d1612")}
    <div class="lbl glass" style="left:10px;bottom:10px;height:26px">Sen</div>
  </div>
  ${dock({ more: true })}
  ${moreMenu}`, { bg: `<div class="ambient"></div>` });

export { serverScreen, serverSide, dock, person, room, qHud, serverMembers };
export default S;
