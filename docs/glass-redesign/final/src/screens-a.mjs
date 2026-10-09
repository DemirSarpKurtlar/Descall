import { phone, tabBar, listHeader, av, gav, AV, I, L, convNav, composer, group, tick, reacts, wave, GROUP_GRAD, GROUP2_GRAD, bgroup } from "./shared.mjs";
const S = {};

const appleMark = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.37 1.2c.1 1.17-.34 2.32-1.02 3.15-.7.84-1.84 1.5-2.96 1.41-.13-1.13.42-2.3 1.06-3.03.72-.83 1.95-1.46 2.92-1.53zM20.6 17.2c-.55 1.27-.82 1.84-1.53 2.96-1 1.55-2.4 3.48-4.15 3.5-1.55.02-1.95-1.01-4.06-1-2.1.01-2.55 1.02-4.1 1-1.74-.03-3.07-1.76-4.07-3.3C-.1 17.5-.4 12.4 1.6 9.4c1.25-1.9 3.23-3 5.08-3 1.88 0 3.07 1.03 4.63 1.03 1.52 0 2.44-1.04 4.62-1.04 1.65 0 3.39.9 4.63 2.45-4.07 2.23-3.41 8.04.04 9.36z"/></svg>`;
const googleMark = `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"/></svg>`;

// ── 01 Login (AuthView order: tabs → Apple → Google → veya → form → forgot → submit → footer) ──
S["01-login"] = phone(`
  <div style="position:absolute;inset:0;z-index:1;background:radial-gradient(40% 20% at 50% 17%, rgba(88,122,246,0.45), transparent 70%)"></div>
  <div class="content" style="padding:92px 20px 0;display:flex;flex-direction:column;align-items:center">
    <img src="../../assets/brand/descall-icon.png" style="width:88px;height:88px;filter:drop-shadow(0 14px 30px rgba(88,122,246,0.45))" alt="Descall"/>
    <div style="font-size:32px;font-weight:700;letter-spacing:-0.028em;margin-top:14px">Descall</div>
    <p style="font-size:15px;color:var(--t2);text-align:center;line-height:21px;margin-top:4px">Arkadaşlarınla ses, görüntü ve<br/>mesajlaşmayla bağlan</p>
    <div class="glass heavy" style="width:100%;margin-top:22px;border-radius:34px;padding:16px 16px 18px">
      <div class="seg glass-chip" style="margin-bottom:16px;height:42px;border-radius:21px"><div class="lens" style="border-radius:18px">Giriş</div><div>Kayıt ol</div></div>
      <div class="btn w" style="height:50px;border-radius:25px;background:#fff;color:#000;font-size:16px">${appleMark}Apple ile devam et</div>
      <div class="btn w fill" style="height:50px;border-radius:25px;margin-top:10px;font-size:16px">${googleMark}Google ile giriş yap</div>
      <div style="display:flex;align-items:center;gap:12px;margin:16px 4px;color:var(--t3);font-size:13px"><span style="flex:1;height:0.5px;background:rgba(255,255,255,0.16)"></span>veya<span style="flex:1;height:0.5px;background:rgba(255,255,255,0.16)"></span></div>
      <div class="field-in">${I.user}<span class="v">demir</span></div>
      <div class="field-in" style="margin-top:10px">${I.lock}<span class="v" style="letter-spacing:0.14em">••••••••••</span><span style="margin-left:auto;color:var(--t3)">${L("eye")}</span></div>
      <div style="display:flex;justify-content:flex-end;margin:10px 4px 0"><span style="font-size:14px;color:var(--brand-hi);font-weight:600">Şifrenizi mi unuttunuz?</span></div>
      <div class="btn w tint-brand" style="margin-top:14px;height:52px;border-radius:26px;font-size:17px">Giriş</div>
    </div>
    <p style="font-size:12.5px;color:var(--t3);text-align:center;margin-top:16px;line-height:18px">Devam ederek Hizmet Şartlarımızı kabul etmiş olursunuz</p>
    <p style="font-size:12.5px;color:var(--t2);text-align:center;margin-top:6px;font-weight:600">Hizmet Şartları <span style="color:var(--t4)">·</span> Gizlilik Politikası</p>
  </div>`);

// ── 02 Sohbetler (ServerSidebar chat view → DMList) ──
const dmRow = (k, st, preview, time, { badge = 0, pinned = false, muted = false, hot = false, sel = false, typing = false } = {}) => `
  <div class="row ${sel ? "sel" : ""}">
    ${av(k, 56, st)}
    <div class="body"><div class="t">${AV[k].name}${pinned ? `<span style="color:var(--t3)">${L("pin", "sm")}</span>` : ""}${muted ? `<span style="color:var(--t3)">${I.bellOff}</span>` : ""}</div>
      <div class="s ${typing ? "" : ""}" style="${typing ? "color:var(--brand-hi);font-weight:550" : ""}">${preview}</div></div>
    <div class="meta"><span class="time ${hot ? "hot" : ""}">${time}</span>${badge ? `<span class="badge ${muted ? "muted" : ""}">${badge}</span>` : `<span style="height:20px"></span>`}</div>
  </div>`;
const swipeRow = (k, st, preview, time) => `
  <div style="position:relative;height:78px;border-radius:18px;overflow:hidden">
    <div style="position:absolute;top:0;bottom:0;right:0;display:flex;align-items:center;gap:6px;padding-right:2px">
      ${[["pin", "Sabitle", "#ff9f0a"], ["bellOff", "Sessiz", "#6e6cf0"], ["mailOpen", "Okundu", "#587AF6"], ["x", "Kapat", "#ff453a"]].map(([ic, l, c]) => `
        <div style="width:50px;display:flex;flex-direction:column;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--t2)"><span style="width:46px;height:46px;border-radius:23px;background:${c};display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,0.3)">${I[ic]}</span>${l}</div>`).join("")}
    </div>
    <div style="position:absolute;top:0;bottom:0;left:-226px;width:100%">
      ${dmRow(k, st, preview, time)}
    </div>
  </div>`;

S["02-chats"] = phone(`
  <div class="content">
    <div class="sect"><span>Sohbetler</span>${I.chevD}</div>
    <div class="list">
      ${dmRow("ayse", "online", "Tamam, 9’da Lobi’de 👋", "21:16", { badge: 2, pinned: true, hot: true })}
      ${dmRow("mert", "online", "yazıyor…", "21:02", { typing: true })}
      ${swipeRow("zeynep", "idle", "Sen: Tamamdır, yarın akşam görüşürüz", "18:40")}
      ${dmRow("can", "dnd", `${I.mic}Sesli mesaj · 0:14`, "Dün")}
      ${dmRow("elif", "online", `${I.image}Görsel`, "Dün", { badge: 3, muted: true })}
      ${dmRow("burak", "off", "gg wp 🔥", "Pzt")}
      ${dmRow("selin", "off", "Sen: Link attım, bakarsın", "Paz")}
      ${dmRow("kaan", "off", "Hafta sonu müsait misin?", "12 Eki")}
    </div>
  </div>
  ${listHeader({ title: "Sohbetler", buttons: ["search", ["megaphone", { badge: 2 }], "feedback"] })}
  <div class="edge-bot"></div>
  ${tabBar("chat", { chat: 5, friends: 1 })}`);

// ── 02b Gruplar (GroupList) ──
const grpRow = (label, grad, name, preview, time, members, badge = 0, extra = "") => `
  <div class="row">${gav(label, grad, 56)}
    <div class="body"><div class="t">${name}</div><div class="s">${preview}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px">${members}</div></div>
    <div class="meta"><span class="time ${badge ? "hot" : ""}">${time}</span>${badge ? `<span class="badge">${badge}</span>` : `<span style="height:20px"></span>`}</div>
  </div>${extra}`;
const stack = (keys, more = 0) => `<div style="display:flex">${keys.map((k, i) => `<div style="margin-left:${i ? -6 : 0}px;border-radius:50%;box-shadow:0 0 0 2px #15161d">${av(k, 20)}</div>`).join("")}</div><span style="font-size:12px;color:var(--t3)">${keys.length + more} üye</span>`;
S["02b-groups"] = phone(`
  <div class="content">
    <div class="sect"><span>Gruplar</span>${I.chevD}</div>
    <div class="list">
      ${grpRow("AE", GROUP_GRAD, "Akşam Ekibi", "Ayşe: Lobi kanalına gelin 🎧", "21:12", stack(["ayse", "mert", "elif", "me"]), 4)}
      ${grpRow("HS", GROUP2_GRAD, "Hafta Sonu", "Mert: Cumartesi 20:00 olur mu?", "19:48", stack(["mert", "can", "burak"]))}
      ${grpRow("KM", "linear-gradient(145deg,#ff9f6b,#e8553a)", "Kampüs", "Zeynep: Notları paylaştım 📎", "Dün", stack(["zeynep", "selin", "kaan", "elif"], 3))}
      ${grpRow("TK", "linear-gradient(145deg,#ffd166,#f0a020)", "Turnuva Kadrosu", "Sen: Kadro tamam, cuma görüşürüz", "Pzt", stack(["can", "burak", "mert", "ayse"], 1))}
      ${grpRow("FG", "linear-gradient(145deg,#ff7aa8,#c2477a)", "Film Gecesi", "Selin: Pazar 21:00, ekran paylaşırım 🍿", "Paz", stack(["selin", "zeynep", "kaan"]))}
      ${grpRow("BS", "linear-gradient(145deg,#5ad1ff,#2f7de0)", "Basketbol", "Kaan: Salı saha bizde", "11 Eki", stack(["kaan", "can", "burak", "me"], 2))}
    </div>
  </div>
  ${listHeader({ title: "Gruplar", buttons: ["search", ["megaphone", { badge: 2 }], "feedback"] })}
  <div class="edge-bot"></div>
  ${tabBar("groups", { chat: 5, friends: 1 })}`);

// ── 03 DM (ChatPanel + MessageList + MessageComposer) ──
const ayseNav = (sub = "Çevrimiçi") => convNav({
  peerHtml: `${av("ayse", 36, "online")}<div style="min-width:0"><div class="nm">Ayşe Yılmaz</div><div class="sb">${sub}</div></div>`,
  buttons: ["search", ["pin", { badge: 1 }], "calls", "video", ["ban", { danger: true }]],
});
const dmMessages = `
  ${group("ayse", "20:38", ["Selam! Akşam oyuna var mısın? 🎮", "Mert ve Elif de gelecek"], { status: "online" })}
  ${group("me", "20:41", [{ html: `Olur, 9 gibi girerim${tick()}` }], { own: true, status: "online", extraAfter: reacts([["👍", 1]]) })}
  ${group("ayse", "20:44", [{ html: `<div class="rq"><b>Demir</b><span>Olur, 9 gibi girerim</span></div>Süper! Akşam Ekibi’ne de yazdım, kanal hazır` }], { status: "online" })}
  <div class="daysep">Bugün</div>
  ${group("ayse", "20:52", [{ html: `<span class="pinb">${I.pin}Sabitlenmiş</span>Cuma 21:00 turnuva — kadroyu unutma!` }], { status: "online", extraAfter: reacts([["🔥", 2, true], ["👍", 1]]) })}
  ${group("me", "20:55", [{ html: `<div class="voice"><span class="pl">${L("play")}</span>${wave(30, 12, 7)}<span class="d">0:14</span></div>${tick()}` }], { own: true, status: "online" })}
  <div class="unreadsep">Yeni mesajlar</div>
  ${group("ayse", "21:14", ["Lobi kanalına geçiyorum, ses ayarlarını bir kontrol et <span class=\"edited\">(düzenlendi)</span>", "Tamam, 9’da Lobi’de 👋"], { status: "online" })}
  <div class="typing">${av("ayse", 22)}<span class="dots"><i></i><i></i><i></i></span>Ayşe yazıyor</div>`;
S["03-dm"] = phone(`
  <div class="msgs">${dmMessages}</div>
  ${ayseNav()}
  ${composer({ text: "Geliyorum, 2 dk" })}`);

// ── 04 Message menu (MessageList: QUICK_EMOJIS + actions). Own message → Yanıtla, Sabitle, Düzenle, Sil. ──
S["04-msg-menu"] = phone(`
  <div class="msgs" style="filter:saturate(0.9)">${dmMessages}</div>
  ${ayseNav()}
  ${composer({})}
  <div class="scrim"></div>
  <div style="position:absolute;left:14px;right:14px;top:236px;z-index:90;display:flex;flex-direction:column;align-items:flex-end;gap:10px">
    <div class="glass heavy" style="height:56px;border-radius:28px;display:flex;align-items:center;gap:4px;padding:0 8px">
      ${["👍", "❤️", "😂", "😮", "😢"].map((e) => `<span style="width:44px;height:44px;border-radius:22px;display:flex;align-items:center;justify-content:center;font-size:25px">${e}</span>`).join("")}
      <span style="width:40px;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.12);color:var(--t1)">${L("smile-plus")}</span>
    </div>
    <div class="mg own" style="margin:0">
      <div class="mh">${av("me", 36, "online")}<span class="who">Demir</span><span class="when">20:41</span></div>
      <div class="bub" style="box-shadow:0 18px 50px rgba(0,0,0,0.55), inset 0 0 0 0.5px rgba(143,166,255,0.4);background:rgba(64,86,170,0.96)">Olur, 9 gibi girerim${tick()}</div>
      ${reacts([["👍", 1]])}
    </div>
    <div class="menu glass heavy" style="position:relative;width:250px">
      <div class="mi">${I.reply}Yanıtla</div>
      <div class="mi">${I.pin}Sabitle</div>
      <div class="mi">${I.pencil}Düzenle</div>
      <div class="mi">${L("smile-plus")}Daha fazla tepki</div>
      <div class="msep"></div>
      <div class="mi danger">${I.trash}Sil</div>
    </div>
  </div>`);

// ── 05 Attach (MessageComposer attachment menu: exactly 3) ──
S["05-attach"] = phone(`
  <div class="msgs">${dmMessages}</div>
  ${ayseNav()}
  ${composer({})}
  <div class="scrim"></div>
  <div class="sheet glass heavy" style="bottom:96px;left:12px;right:auto;width:236px;border-radius:30px;padding:8px">
    ${[["image", "Görsel Yükle", "Fotoğraflar veya kamera", "linear-gradient(145deg,#4cd97b,#1fa850)"],
       ["file", "Dosya Yükle", "Belge, ses veya arşiv", "linear-gradient(145deg,#7d97ff,#4a68e8)"],
       ["gift", "GIF Gönder", "GIF ara ve paylaş", "linear-gradient(145deg,#ff8fc1,#bf5af2)"]].map(([ic, t, s, g]) => `
      <div class="mi" style="height:60px;gap:14px"><span class="av sq" style="--s:40px;background:${g};border-radius:12px">${I[ic]}</span>
        <b style="font-size:16px;font-weight:600">${t}</b></div>`).join("")}
  </div>
  <div style="position:absolute;left:12px;bottom:24px;z-index:85;width:52px;height:52px;border-radius:26px" class="cbtn lens"><span style="display:flex;transform:rotate(45deg)">${I.plus}</span></div>`);

export default S;
