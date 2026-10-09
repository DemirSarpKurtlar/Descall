import { phone, tabBar, listHeader, av, gav, AV, I, L, GROUP_GRAD, convNav, composer, group, tick, reacts, bgroup } from "./shared.mjs";
const S = {};

const serverRail = (active = 0) => `
  <div style="width:68px;display:flex;flex-direction:column;align-items:center;gap:10px;padding:4px 0;flex-shrink:0">
    ${[["AE", GROUP_GRAD, 0], ["🎮", "linear-gradient(145deg,#2d6a4f,#1a3d30)", 1], ["TR", "linear-gradient(145deg,#c25757,#7a2a2a)", 2]].map(([lab, g, i]) => `
      <div class="av sq" style="--s:48px;background:${g};font-size:15px;${i === active ? "box-shadow:0 0 0 2.5px var(--brand),0 4px 16px rgba(88,122,246,0.4);border-radius:14px" : "border-radius:16px"}">${lab}</div>`).join("")}
    <div class="av sq glass-chip" style="--s:48px;border-radius:16px;border:1.5px dashed rgba(255,255,255,0.28);background:transparent;color:var(--t2)">${I.plus}</div>
  </div>`;

const chan = (name, { active = false, voice = false, count = 0, members = "" } = {}) => `
  <div style="display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:12px;font-size:15px;color:${active ? "var(--t1)" : "var(--t2)"};${active ? "background:rgba(88,122,246,0.22);font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,0.1)" : ""}">
    ${voice ? I.volume : I.hash}<span style="flex:1">${name}</span>${count ? `<span class="badge" style="height:18px;min-width:18px;font-size:11px">${count}</span>` : ""}
  </div>${members}`;

// ── 11 Servers ──
S["11-servers"] = phone(`
  <div class="content" style="padding:120px 12px 0;display:flex;gap:8px">
    ${serverRail(0)}
    <div class="glass" style="flex:1;min-width:0;border-radius:22px;padding:12px 8px 16px;overflow:hidden;margin-bottom:100px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px 10px">
        <div style="font-size:17px;font-weight:700;letter-spacing:-0.02em">Akşam Ekibi</div>
        <div class="cbtn glass-chip" style="width:30px;height:30px;border-radius:15px">${I.chevR}</div>
      </div>
      <div class="sect" style="padding:8px 8px 4px;margin:0"><span>Yazı Kanalları</span></div>
      ${chan("genel", { active: true })}
      ${chan("strateji")}
      ${chan("meme")}
      <div class="sect" style="padding:14px 8px 4px;margin:0"><span>Ses Kanalları</span></div>
      ${chan("Lobi", { voice: true })}
      ${chan("Ranked", { voice: true, count: 3, members: `
        <div style="padding:2px 8px 6px 34px">
          ${[["ayse", "Ayşe Yılmaz"], ["mert", "Mert K."], ["elif", "Elif"]].map(([k, n]) => `
            <div style="display:flex;align-items:center;gap:8px;padding:4px 0">${av(k, 22, "online")}<span style="font-size:13px">${n}</span></div>`).join("")}
        </div>` })}
      ${chan("AFK", { voice: true })}
    </div>
  </div>
  <div class="edge-top" style="height:130px"></div>
  <div class="toolbar">${`<div class="me-btn glass">${av("me", 38, "online")}</div>`}<div class="sp"></div>
    <div class="inline-title" style="margin-right:8px">Sunucular</div>
    <div class="cbtn glass tint-brand">${I.plus}</div>
  </div>
  <div class="edge-bot"></div>
  ${tabBar("servers", { chat: 5, friends: 1 })}`);

// ── 12 Server channel (#genel) — Discord-style messages ──
const chNav = convNav({
  peerHtml: `<span style="opacity:0.7;display:flex">${I.hash}</span><div style="min-width:0"><div class="nm">genel</div><div class="sb dim">Akşam Ekibi · 12 üye</div></div>`,
  buttons: ["search", "users", ["pin", { badge: 1 }]],
});
const chMsgs = `
  <div class="daysep">Bugün</div>
  ${group("mert", "20:10", ["Bu akşam ranked mi?"], { status: "online" })}
  ${group("ayse", "20:11", ["Evet, Lobi kanalına gelin.", { html: `<div class="code"><span class="lang">js</span><span class="k">const</span> lobby = <span class="s">'Akşam Ekibi'</span>;\n<span class="c">// 21:00'da başlıyoruz</span></div>` }], { status: "online", extraAfter: reacts([["👍", 3, true], ["🔥", 1]]) })}
  ${group("elif", "20:12", ["Ben hazırım 🎯"], { status: "online" })}
  ${group("me", "20:14", [{ html: `Geliyorum, 2 dk${tick()}` }], { own: true, status: "online" })}
  ${group("burak", "20:16", [{ html: `<div class="rq"><b>Demir</b><span>Geliyorum, 2 dk</span></div>Ben de, AFK'dan geçiyorum` }], { status: "online" })}`;
S["12-server-channel"] = phone(`
  <div class="msgs">${chMsgs}</div>
  ${chNav}
  ${composer({ placeholder: "#genel'e mesaj yaz…" })}`);

// ── 13 Server menu ──
S["13-server-menu"] = phone(`
  <div class="content" style="padding:120px 12px 0;display:flex;gap:8px;filter:blur(2px) brightness(0.5)">
    ${serverRail(0)}
    <div class="glass" style="flex:1;border-radius:22px;padding:12px"><div style="font-weight:700;padding:8px">Akşam Ekibi</div>${chan("genel", { active: true })}</div>
  </div>
  ${tabBar("servers")}
  <div class="scrim"></div>
  <div class="sheet glass heavy">
    <div class="grabber"></div>
    <div style="display:flex;align-items:center;gap:12px;padding:0 4px 14px">
      ${gav("AE", GROUP_GRAD, 48, "sq")}
      <div><div style="font-size:18px;font-weight:700">Akşam Ekibi</div><div style="font-size:13px;color:var(--t3)">12 üye · 3 sesli</div></div>
    </div>
    <div class="group" style="background:rgba(255,255,255,0.06)">
      ${[["Roller", I.shield], ["İnsanları davet et", I.userPlus], ["Sunucu Ayarları", I.settings], ["Topluluk ve Keşif", I.globe], ["Sunucu ikonunu değiştir", I.camera]].map(([l, ic]) => `
        <div class="grow"><span style="color:var(--t2)">${ic}</span><span class="lbl"><b>${l}</b></span><span class="chev">${I.chevR}</span></div>`).join("")}
    </div>
    <div class="sect" style="margin-top:16px"><span>Bildirim Ayarları</span></div>
    <div class="group noicon" style="background:rgba(255,255,255,0.06)">
      ${[["Tüm mesajlar", false], ["Sadece @bahsetmeler", true], ["Hiçbiri", false]].map(([l, on]) => `
        <div class="grow"><span class="lbl"><b>${l}</b></span>${on ? `<span style="color:var(--brand)">${I.check}</span>` : ""}</div>`).join("")}
    </div>
    <div class="group noicon" style="background:rgba(255,255,255,0.06);margin-top:12px">
      <div class="grow"><span class="lbl"><b style="color:#ff6961">Sunucudan Ayrıl</b></span></div>
    </div>
  </div>`);

// ── 14 Profile (other user modal — Ayşe) ──
S["14-profile"] = phone(`
  <div class="content" style="padding:0;top:0;filter:blur(4px) brightness(0.4)">
    <div class="sect" style="padding-top:230px"><span>Çevrimiçi — 4</span></div>
    <div class="row">${av("ayse", 52, "online")}<div class="body"><div class="t">Ayşe Yılmaz</div></div></div>
  </div>
  ${listHeader({ title: "Arkadaşlar", buttons: ["search"] })}
  ${tabBar("friends")}
  <div class="scrim"></div>
  <div class="sheet glass heavy" style="bottom:auto;top:8%;left:12px;right:12px;padding:0;overflow:hidden;max-height:84%">
    <div style="height:120px;background:linear-gradient(135deg,rgba(88,122,246,0.9),rgba(124,92,255,0.7) 50%,rgba(30,31,34,0.3));position:relative">
      <div class="cbtn glass" style="position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:17px">${I.x}</div>
    </div>
    <div style="padding:0 18px 22px;margin-top:-44px;position:relative">
      <div style="position:relative;display:inline-block">
        <div style="position:absolute;inset:-10px;border-radius:50%;background:radial-gradient(circle,rgba(88,122,246,0.5),transparent 70%);filter:blur(6px)"></div>
        ${av("ayse", 88, "online")}
        <div style="position:absolute;inset:-4px;border-radius:50%;border:2.5px solid rgba(168,185,255,0.75);pointer-events:none"></div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:12px">
        <div style="font-size:26px;font-weight:700;letter-spacing:-0.024em">Ayşe Yılmaz</div>
        <span class="ttag" style="background:rgba(255,201,77,0.2);color:var(--gold)">Gold Duo</span>
      </div>
      <div style="font-size:14px;color:var(--t2);margin-top:2px">@ayse · <span style="color:var(--ok)">Çevrimiçi</span></div>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
        <span class="chip" style="height:26px;font-size:12px">🛡️ Staff</span>
        <span class="chip" style="height:26px;font-size:12px">🎮 Valorant · Gold 2</span>
      </div>
      <p style="font-size:14px;color:var(--t2);line-height:20px;margin-top:12px">Valorant · Gold 2 · Descall'da takılıyoruz. Ranked duo DM.</p>
      <div style="display:flex;gap:8px;margin-top:16px">
        <div class="btn tint-brand" style="flex:1;height:44px">${I.chat} Mesaj Gönder</div>
        <div class="btn fill" style="flex:1;height:44px;margin:0">${I.userCheck} Arkadaşlar</div>
      </div>
      <div class="group noicon" style="background:rgba(255,255,255,0.06);margin-top:16px">
        <div class="grow"><span class="lbl"><b>Üyelik Tarihi</b></span><span class="val">Mart 2025</span></div>
        <div class="grow"><span class="lbl"><b>Ortak Arkadaşlar</b></span><span class="val">3</span></div>
        <div class="grow"><span class="lbl"><b>Özel Durum</b></span><span class="val">🔥 Ranked arıyorum</span></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <div class="btn fill" style="flex:1;height:40px;color:#ff6961">${I.ban} Engelle</div>
        <div class="btn fill" style="flex:1;height:40px;color:#ff6961">${I.flag} Şikayet et</div>
      </div>
    </div>
  </div>`);

// ── 14b Profile edit (own settings → Profil) ──
S["14b-profile-edit"] = phone(`
  <div class="edge-top" style="height:130px"></div>
  <div class="toolbar">
    <div class="cbtn glass" style="width:auto;padding:0 14px;height:36px;border-radius:18px;font-size:15px;font-weight:600">İptal</div>
    <div class="sp"></div>
    <div class="inline-title">Profil</div>
    <div class="sp"></div>
    <div class="cbtn tint-brand" style="width:auto;padding:0 14px;height:36px;border-radius:18px;font-size:15px;font-weight:650">Kaydet</div>
  </div>
  <div class="content" style="padding-top:124px">
    <div style="text-align:center;margin-bottom:8px">
      <div style="position:relative;display:inline-block">${av("me", 96)}
        <div style="position:absolute;right:-2px;bottom:-2px;width:32px;height:32px;border-radius:16px;background:var(--brand);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px #0d0e13">${I.camera}</div>
      </div>
      <div style="font-size:14px;color:var(--brand-hi);font-weight:600;margin-top:10px">Avatarı değiştir</div>
    </div>
    <div class="sect"><span>Kimlik</span></div>
    <div class="group noicon" style="background:rgba(255,255,255,0.06)">
      <div class="grow"><span class="lbl"><b style="color:var(--t3);font-size:13px">Görünen ad</b><em style="color:var(--t1);font-size:16px;font-weight:500;margin-top:2px">Demir Sarp</em></span></div>
      <div class="grow"><span class="lbl"><b style="color:var(--t3);font-size:13px">Kullanıcı adı</b><em style="color:var(--t1);font-size:16px;font-weight:500;margin-top:2px">demir</em></span></div>
    </div>
    <div class="sect" style="margin-top:16px"><span>Hakkımda</span></div>
    <div class="glass" style="padding:14px;border-radius:18px;min-height:88px;font-size:15px;color:var(--t2);line-height:1.4">Valorant · Gold 2 · Descall'da takılıyoruz. Ranked duo DM.</div>
    <div class="sect" style="margin-top:16px"><span>Banner</span></div>
    <div style="height:80px;border-radius:16px;background:linear-gradient(135deg,rgba(88,122,246,0.8),rgba(124,92,255,0.6));display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;font-weight:600;color:#fff">${I.image} Banner'ı değiştir</div>
    <div class="sect" style="margin-top:16px"><span>Özel durum</span></div>
    <div class="field-in"><span style="font-size:18px">🔥</span><span class="v">Ranked arıyorum</span></div>
  </div>`);

export default S;
