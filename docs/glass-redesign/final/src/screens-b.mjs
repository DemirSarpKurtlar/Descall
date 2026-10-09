import { phone, tabBar, listHeader, av, gav, AV, I, L, GROUP_GRAD, GROUP2_GRAD, bgroup, meBtn } from "./shared.mjs";
const S = {};

const ctrlBar = (extra = "") => `
  <div class="ctrl glass">
    <div class="cb g">${I.mic}</div>
    <div class="cb g">${I.headphones}</div>
    <div class="cb g">${I.video}</div>
    <div class="cb g">${I.monitor}<span class="qb">${I.sliders}</span></div>
    <div class="cb g">${I.moreV}</div>
    <div class="cb end tint-red">${I.phoneOff}</div>
  </div>${extra}`;

const callHead = (title, sub, trailing = "") => `
  <div class="call-head">
    <div class="cbtn glass">${I.chevD}</div>
    <div class="call-title glass">
      <div style="min-width:0;flex:1"><div class="nm">${title}</div><div class="sb">${sub}</div></div>
      <div class="qbars" title="Bağlantı kalitesi · Mükemmel"><i style="height:5px"></i><i style="height:8px"></i><i style="height:11px"></i><i style="height:14px"></i></div>
      ${trailing}
    </div>
  </div>`;

const tileLabel = (name, { muted = false, speaking = false, you = false } = {}) => `
  <div class="lbl glass-chip">${speaking ? `<span class="sd"></span>` : ""}${name}${you ? "" : ""}${muted ? I.micOff : ""}</div>`;

// ── 06 1:1 call ──
S["06-call-11"] = phone(`
  <div class="call-bg"></div>
  ${callHead("Ayşe Yılmaz", "04:12 · Sesli arama")}
  <div style="position:absolute;left:28px;right:28px;top:140px;bottom:130px;z-index:10;display:flex;align-items:center;justify-content:center">
    <div class="tile vid-a speaking" style="width:100%;height:100%;max-height:560px;border-radius:36px">
      <div class="ring-av talk">${av("ayse", 140)}</div>
      ${tileLabel("Ayşe Yılmaz", { speaking: true })}
      <div class="tr glass-chip" style="left:10px;right:auto">${I.signal}<span style="font-size:11px;font-weight:650">Mükemmel</span></div>
    </div>
  </div>
  <div style="position:absolute;right:28px;bottom:140px;z-index:20;width:110px;height:148px" class="tile vid-self">
    ${av("me", 56)}
    <div class="lbl glass-chip" style="left:6px;bottom:6px;height:24px;font-size:11px;padding:0 8px">Sen</div>
  </div>
  ${ctrlBar()}`, { bg: "" });

// ── 07 Group call — header capsule, 2×2 taller tiles, control bar flush ──
S["07-group-call"] = phone(`
  <div class="call-bg"></div>
  ${callHead("Akşam Ekibi", "Grup araması · 4 katılımcı · 12:08", `<div class="cbtn glass" style="width:40px;height:40px;border-radius:20px;margin-left:4px">${I.users}</div>`)}
  <div style="position:absolute;left:12px;right:12px;top:132px;bottom:116px;z-index:10;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:10px">
    <div class="tile vid-a speaking">${av("ayse", 72)}${tileLabel("Ayşe", { speaking: true })}</div>
    <div class="tile vid-b">${av("mert", 72)}${tileLabel("Mert K.")}</div>
    <div class="tile vid-c cam-off" style="background:linear-gradient(160deg,#1a2420,#121820)">
      ${av("elif", 72)}
      ${tileLabel("Elif", { muted: true })}
      <div class="tr glass-chip" style="background:rgba(255,69,58,0.85);color:#fff">${I.micOff}</div>
    </div>
    <div class="tile vid-self">${av("me", 72)}${tileLabel("Sen", { you: true })}
      <div class="tr glass-chip">${I.videoOff}</div>
    </div>
  </div>
  ${ctrlBar()}`, { bg: "" });

// ── 08 Incoming (IncomingCallCard expanded to full screen for mockup clarity) ──
S["08-incoming"] = phone(`
  <div class="call-bg"></div>
  <div style="position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;padding-top:150px">
    <div class="glass-chip" style="height:28px;padding:0 12px;border-radius:14px;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:650;letter-spacing:0.04em;text-transform:uppercase;color:var(--t2)">${I.calls}Gelen sesli arama</div>
    <div style="position:relative;margin-top:36px">
      <div style="position:absolute;inset:-18px;border-radius:50%;border:2px solid rgba(88,122,246,0.45)"></div>
      <div style="position:absolute;inset:-36px;border-radius:50%;border:1.5px solid rgba(88,122,246,0.22)"></div>
      <div style="position:absolute;inset:-54px;border-radius:50%;border:1px solid rgba(88,122,246,0.10)"></div>
      ${av("mert", 120)}
      <div style="position:absolute;right:4px;bottom:4px;width:36px;height:36px;border-radius:18px;background:var(--brand);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px #0d0e13">${I.calls}</div>
    </div>
    <div style="font-size:32px;font-weight:700;letter-spacing:-0.026em;margin-top:28px">Mert K. arıyor</div>
    <div style="font-size:16px;color:var(--t2);margin-top:6px">Sesli arama</div>
    <div style="flex:1"></div>
    <div style="display:flex;gap:64px;margin-bottom:88px;align-items:center">
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
        <div class="cb tint-red" style="width:76px;height:76px;border-radius:38px">${I.phoneOff}</div>
        <span style="font-size:14px;font-weight:600;color:var(--t2)">Reddet</span>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
        <div class="cb tint-green" style="width:76px;height:76px;border-radius:38px">${I.calls}</div>
        <span style="font-size:14px;font-weight:600;color:var(--t2)">Kabul Et</span>
      </div>
    </div>
  </div>`, { bg: "" });

// ── 09 Friends (ServerSidebar friends view) ──
const fRow = (k, st, sub, actions = true) => `
  <div class="row">${av(k, 52, st)}
    <div class="body"><div class="t">${AV[k].name}</div><div class="s ${st === "offline" || st === "off" ? "dim" : ""}">${sub}</div></div>
    ${actions ? `<div class="ib brand">${I.chat}</div><div class="ib">${I.calls}</div>` : ""}
  </div>`;

S["09-friends"] = phone(`
  <div class="content">
    <div class="card pad" style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
      <div class="av sq" style="--s:48px;background:linear-gradient(145deg,#7d97ff,#4a68e8)">${I.link}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:650">Arkadaş davet et</div>
        <div style="font-size:13px;color:var(--t3);margin-top:2px;line-height:17px">Descall'a katıl — ikimiz de DesCoin kazanırız</div>
        <div style="font-size:12px;color:var(--gold);margin-top:4px;font-weight:600">Sen 100 · onlar 50 DesCoin</div>
      </div>
      <div class="btn sm fill">${I.copy}Kopyala</div>
    </div>
    <div class="sect" style="color:var(--idle)"><span>Bekleyen — 1</span></div>
    <div class="row">${av("can", 52)}
      <div class="body"><div class="t">Can Demir</div><div class="s dim">@candemir</div></div>
      <div class="ib ok">${I.check}</div>
      <div class="ib no">${I.x}</div>
    </div>
    <div class="gap12"></div>
    <div class="sect"><span>Çevrimiçi — 4</span></div>
    ${fRow("ayse", "online", "Çevrimiçi")}
    ${fRow("mert", "online", "Valorant oynuyor")}
    ${fRow("elif", "online", "Çevrimiçi")}
    ${fRow("selin", "idle", "Boşta")}
    <div class="gap12"></div>
    <div class="sect"><span>Çevrimdışı — 3</span></div>
    ${fRow("burak", "off", "Çevrimdışı", false)}
    ${fRow("zeynep", "off", "Çevrimdışı", false)}
    ${fRow("kaan", "off", "Çevrimdışı", false)}
  </div>
  ${listHeader({ title: "Arkadaşlar", buttons: ["search", ["megaphone", { badge: 2 }], "feedback", "link"] })}
  <div class="edge-bot"></div>
  ${tabBar("friends", { chat: 5, friends: 1 })}`);

// ── 10 Add friend modal (Create New: Quick Add / Add Friend / Create Group) ──
S["10-add-friend"] = phone(`
  <div class="content" style="filter:blur(3px) brightness(0.55);padding-top:222px">
    <div class="sect"><span>Çevrimiçi — 4</span></div>
    ${fRow("ayse", "online", "Çevrimiçi")}
    ${fRow("mert", "online", "Valorant oynuyor")}
  </div>
  ${listHeader({ title: "Arkadaşlar", buttons: ["search", "megaphone", "feedback", "link"] })}
  ${tabBar("friends")}
  <div class="scrim"></div>
  <div class="sheet glass heavy" style="bottom:auto;top:12%;left:12px;right:12px;padding-bottom:22px">
    <div class="grabber"></div>
    <div class="sheet-h"><div><h3>Yeni Oluştur</h3></div><div class="cbtn glass-chip" style="width:34px;height:34px;border-radius:17px">${I.x}</div></div>
    <div class="seg glass-chip" style="margin-bottom:16px;height:42px;border-radius:21px;grid-template-columns:1fr 1fr 1fr">
      <div style="gap:5px;font-size:13px">${I.sparkles}Hızlı Ekle</div>
      <div class="lens" style="border-radius:18px;gap:5px;font-size:13px">${I.user}Arkadaş</div>
      <div style="gap:5px;font-size:13px">${I.users}Grup</div>
    </div>
    <div class="flabel">Eklemek için kullanıcı adı gir</div>
    <div class="field-in">${I.user}<span class="v">ayse_yilmaz</span></div>
    <div class="btn w tint-brand" style="margin-top:16px;height:50px;border-radius:25px">${I.userPlus}Arkadaşlık İsteği Gönder</div>
    <p style="font-size:12.5px;color:var(--t3);text-align:center;margin-top:14px;line-height:17px">Kullanıcı adıyla arkadaşlık isteği gönder</p>
  </div>`);

export default S;
