import { win, rail, sideHeader, chead, peerDm, DM_BTNS, composer, group, tick, reacts, av, gav, AV, I, L, bgroup, GROUP_GRAD } from "./shared.mjs";
import { dmScreen } from "./screens-a.mjs";
import { serverScreen } from "./screens-b.mjs";
const S = {};

// ── 11 Friends (ServerSidebar friends section + InviteCard + main empty state) ──
const fRow = (k, st, label, { pending = false, hov = false, off = false } = {}) => `
  <div class="row ${hov ? "hov" : ""}" style="min-height:56px;${off ? "opacity:0.62" : ""}">${av(k, 40, off ? "off" : st)}
    <div class="body"><div class="top"><span class="t">${AV[k].name}</span></div><div class="bot"><span class="s">${label}</span></div></div>
    ${pending ? `<div style="display:flex;gap:6px"><span class="ib ok" title="Kabul Et">${I.check}</span><span class="ib no" title="Reddet">${I.x}</span></div>` : ""}
  </div>`;
const inviteCard = `
  <div class="card" style="margin:4px 4px 8px;padding:10px 10px 10px 12px;display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,rgba(88,122,246,0.22),rgba(255,201,77,0.10));box-shadow:inset 0 0 0 0.5px rgba(143,166,255,0.35),inset 0 1px 0 rgba(255,255,255,0.12)">
    <div style="flex:1;min-width:0;white-space:nowrap;overflow:hidden"><div style="font-size:13.5px;font-weight:650;display:flex;align-items:center;gap:6px"><span style="color:var(--gold);display:flex">${L("gift", "sm")}</span>Arkadaş davet et</div><div style="font-size:11.5px;color:var(--t2)">Sen 100 · onlar 50 DesCoin</div></div>
    <span class="btn xs tint-brand" style="padding:0 10px">${I.copy}Kopyala</span>
  </div>`;
const friendsSide = `
    <aside class="side glass panel">
      ${sideHeader("Arkadaşlar", { buttons: [["megaphone", { t: "Duyurular", badge: 2, red: true }], ["feedback", { t: "Geri Bildirim Gönder" }], ["link", { t: "Davet linkini kopyala" }]], search: "Arkadaş ara…", toolsInSearch: true })}
      <div class="side-body">
        <div class="sect">Arkadaşlar<span class="badge red" style="margin-left:6px">2</span><span class="sp"></span><span style="color:var(--brand-hi);display:flex" title="Hızlı Ekle">${I.sparkles}</span>${I.chevD}</div>
        ${inviteCard}
        <div class="sect" style="padding-top:6px">Bekleyen — 2</div>
        ${fRow("kaan", "online", "@kaan", { pending: true })}
        ${fRow("deniz", "off", "@denizt", { pending: true })}
        <div class="sect" style="padding-top:10px">Çevrimiçi — 4</div>
        ${fRow("ayse", "online", "🎧 Lobi’de takılıyorum", { hov: true })}
        ${fRow("mert", "idle", "Boşta")}
        ${fRow("elif", "online", "🎮 Valorant oynuyor")}
        ${fRow("can", "dnd", "Rahatsız Etme")}
        <div class="sect" style="padding-top:10px">Çevrimdışı — 3</div>
        ${fRow("burak", "off", "Çevrimdışı", { off: true })}
        ${fRow("selin", "off", "Çevrimdışı", { off: true })}
      </div>
    </aside>`;
const emptyMain = `
    <main class="main" style="display:flex;align-items:center;justify-content:center">
      <div style="text-align:center;max-width:420px;position:relative;z-index:5">
        <div style="position:relative;width:132px;height:132px;margin:0 auto 24px">
          <div class="glass" style="position:absolute;inset:0;border-radius:40px;display:flex;align-items:center;justify-content:center;color:var(--brand-hi)">${L("users-round", "xl")}</div>
          <span style="position:absolute;right:-14px;top:-10px">${av("ayse", 44, "online", "", "#202233")}</span>
          <span style="position:absolute;left:-18px;bottom:6px">${av("elif", 38, "online", "", "#202233")}</span>
          <span style="position:absolute;right:-6px;bottom:-12px">${av("mert", 34, "idle", "", "#202233")}</span>
        </div>
        <h2 style="font-size:26px;font-weight:700;letter-spacing:-0.03em">Arkadaşlarını bul</h2>
        <p style="font-size:14.5px;color:var(--t2);margin-top:8px;line-height:21px">Sohbet ve arama için bir arkadaş ekle</p>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:22px"><span class="btn tint-brand">${I.friends}Arkadaş ekle</span><span class="btn glass-chip">${I.chat}Sohbetlere göz at</span></div>
      </div>
    </main>`;
S["11-friends"] = win(`<div class="app">${rail("friends", { badges: { chat: 3, groups: 5, friends: 2 } })}${friendsSide}${emptyMain}</div>`);

// 11b Yeni Oluştur modal — Arkadaş Ekle + Hızlı Ekle tabs
const addModal = (tab) => `
  <div class="scrim"></div>
  <div class="modal glass heavy" style="left:50%;top:calc(50% + 20px);transform:translate(-50%,-50%);width:520px">
    <div class="modal-h"><div style="flex:1"><h3>Yeni Oluştur</h3><p>${tab === "quick" ? "Tanıyor olabileceğin kişiler — ortak arkadaş ve ortak grup sayısına göre sıralandı." : "Kullanıcı adıyla arkadaşlık isteği gönder"}</p></div><span class="xbtn">${I.x}</span></div>
    <div style="padding:16px 24px 0"><div class="seg glass-chip">${[["sparkles", "Hızlı Ekle", "quick"], ["friends", "Arkadaş Ekle", "friend"], ["users", "Grup Oluştur", "group"]].map(([i, l, id]) => `<div class="${id === tab ? "lens" : ""}">${I[i]}${l}</div>`).join("")}</div></div>
    ${tab === "friend" ? `
    <div style="padding:20px 24px 0">
      <div class="flabel">Kullanıcı adı</div>
      <div class="field-in focus"><span style="color:var(--t3);display:flex">${I.user}</span><span class="v">zeynep.k</span></div>
      <p class="hint" style="margin-top:8px">Eklemek için kullanıcı adı gir</p>
      <div class="toast glass" style="position:relative;width:auto;margin-top:16px;min-height:52px;background:rgba(48,209,88,0.10);box-shadow:inset 0 0 0 0.5px rgba(48,209,88,0.35)"><span class="ti" style="background:rgba(48,209,88,0.2);color:#7ee2a0">${I.check}</span><div class="tb"><b>İstek gönderildi.</b><span>kaan kullanıcısına istek gönderildi</span></div></div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;padding:20px 24px 22px"><span class="btn fill">İptal</span><span class="btn tint-brand">${I.send}Arkadaşlık İsteği Gönder</span></div>` : `
    <div style="padding:14px 16px 18px">
      ${[["zeynep", "3 ortak arkadaş", "", false], ["kaan", "2 ortak grup", "", true], ["deniz", "Senin için önerildi", "", false], ["selin", "1 ortak arkadaş", "", false]].map(([k, sub, _, sent]) => `
        <div class="row" style="min-height:60px">${av(k, 40)}<div class="body"><div class="top"><span class="t">${AV[k].name}</span></div><div class="bot"><span class="s">@${AV[k].user} · ${sub}</span></div></div>
        ${sent ? `<span class="btn xs fill" style="color:var(--t3)">${I.check}Gönderildi</span>` : `<span class="btn xs tint-brand">${I.friends}Ekle</span>`}</div>`).join("")}
    </div>`}
  </div>`;
S["11b-add-friend"] = win(`<div class="app">${rail("friends", { badges: { chat: 3, groups: 5, friends: 2 } })}${friendsSide}${emptyMain}</div>${addModal("friend")}`);
S["11c-quick-add"] = win(`<div class="app">${rail("friends", { badges: { chat: 3, groups: 5, friends: 2 } })}${friendsSide}${emptyMain}</div>${addModal("quick")}`);

// ── 12a Hover card (UserHoverCard over server chat) ──
const banner = (h, extra = "") => `<div style="height:${h}px;position:relative;background:radial-gradient(80% 140% at 15% 10%,#ff7a7f,transparent 60%),radial-gradient(80% 140% at 90% 90%,#8a5cf6,transparent 60%),linear-gradient(135deg,#3a2a55,#22243a);${extra}"></div>`;
const valBadge = `<span class="ttag" style="background:rgba(255,70,85,0.16);color:#ff8a93;height:22px;padding:0 8px;border-radius:11px;display:inline-flex;align-items:center;gap:5px;font-size:11.5px">${L("crosshair", "sm")}Elmas 2 · ayse#TR1</span>`;
const hoverCard = `
  <div class="glass heavy" style="position:absolute;z-index:260;left:${8 + 72 + 8 + 296 + 8 + 60}px;top:${40 + 168}px;width:320px;border-radius:24px;overflow:hidden">
    ${banner(92)}
    <div style="padding:0 16px 16px;margin-top:-36px;position:relative">
      ${av("ayse", 76, "online", "", "#2a2c3e")}
      <div style="margin-top:10px;display:flex;align-items:center;gap:6px"><span style="font-size:19px;font-weight:700;letter-spacing:-0.02em">Ayşe Yılmaz</span><span style="color:var(--gold);display:flex" title="Rozet">${L("badge-check")}</span></div>
      <div style="font-size:13px;color:var(--t2)">@ayse · <span style="color:var(--brand-hi)">Turnuva Kaptanı</span></div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:12.5px;color:var(--t2)"><span style="width:8px;height:8px;border-radius:4px;background:var(--ok)"></span>Çevrimiçi <span style="color:var(--t4)">·</span> 🎧 Lobi’de takılıyorum</div>
      <div style="margin-top:10px">${valBadge}</div>
      <div class="card" style="margin-top:12px;padding:10px 12px;font-size:13px;line-height:19px;color:var(--t1)">Akşamları ranked, hafta sonu turnuva. Kadroyu ben kurarım 🎯</div>
    </div>
  </div>`;
S["12a-hover-card"] = serverScreen({ overlay: hoverCard });

// ── 12b Full profile modal (UserProfileModal) ──
const profileModal = `
  <div class="scrim"></div>
  <div class="modal glass heavy" style="left:50%;top:calc(50% + 20px);transform:translate(-50%,-50%);width:560px;overflow:hidden;padding:0">
    ${banner(150)}
    <span class="xbtn glass" style="position:absolute;top:14px;right:14px" title="Kapat">${I.x}</span>
    <div style="padding:0 24px 22px;margin-top:-52px;position:relative">
      <div style="display:flex;align-items:flex-end;gap:16px">
        ${av("ayse", 104, "online", "", "#2a2c3e")}
        <div style="flex:1"></div>
        <div style="display:flex;gap:8px;padding-bottom:6px"><span class="btn tint-brand">${I.chat}Mesaj Gönder</span><span class="btn fill" style="color:#7ee2a0">${I.userCheck}Arkadaşlar</span></div>
      </div>
      <div style="margin-top:12px;display:flex;align-items:center;gap:8px"><span style="font-size:24px;font-weight:700;letter-spacing:-0.03em">Ayşe Yılmaz</span><span style="color:var(--gold);display:flex">${L("badge-check")}</span><span class="ttag" style="background:rgba(255,201,77,0.16);color:var(--gold)">ADMIN</span></div>
      <div style="font-size:14px;color:var(--t2);margin-top:2px">@ayse · <span style="color:var(--brand-hi)">Turnuva Kaptanı</span></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:var(--t2)"><span style="width:9px;height:9px;border-radius:5px;background:var(--ok)"></span>Çevrimiçi ${valBadge}</div>
      <div class="card" style="margin-top:16px">
        <div class="grow" style="min-height:auto;padding:14px 16px;display:block"><div class="flabel" style="margin:0 0 4px">Biyografi</div><div style="font-size:14px;line-height:20px">Akşamları ranked, hafta sonu turnuva. Kadroyu ben kurarım 🎯</div></div>
        <div class="grow" style="min-height:auto;padding:14px 16px;display:block"><div class="flabel" style="margin:0 0 4px">Özel durum</div><div style="font-size:14px">🎧 Lobi’de takılıyorum</div></div>
        <div class="grow" style="min-height:auto;padding:14px 16px;display:flex;gap:24px">
          <div style="flex:1"><div class="flabel" style="margin:0 0 4px">Üyelik Tarihi</div><div style="font-size:14px">14 Mart 2025</div></div>
          <div style="flex:1.4"><div class="flabel" style="margin:0 0 6px">Ortak Arkadaşlar</div><div style="display:flex;align-items:center;gap:8px"><span style="display:flex">${["mert", "elif", "can"].map((k, i) => `<span style="margin-left:${i ? -8 : 0}px;border-radius:50%;box-shadow:0 0 0 2px #2b2d40">${av(k, 24)}</span>`).join("")}</span><span style="font-size:13px;color:var(--t2)">Mert K. ve 2 kişi daha</span></div></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px"><span class="btn sm danger">${I.ban}Engelle</span><span class="btn sm fill" style="color:#ff8a82">${I.flag}Şikayet et</span></div>
    </div>
  </div>`;
S["12b-profile"] = dmScreen({ overlay: profileModal });

// ── 13 User settings shell (UserPanel) ──
const NAV = [["HESAP", [["user", "Hesabım", "account"], ["edit3", "Profil", "profile"], ["shield", "Güvenlik", "security"]]],
  ["UYGULAMA", [["palette", "Görünüm", "appearance"], ["bell", "Bildirimler", "notifications"], ["globe", "Dil", "language", "Türkçe"]]],
  ["MEDYA", [["mic", "Ses ve Görüntü", "voice"], ["volume", "Ses Efektleri", "sfx"]]],
  ["KİŞİSELLEŞTİRME", [["bag", "Mağaza", "shop"]]]];
export function settings(active, title, sub, content, { footer = "", headRight = "" } = {}) {
  return dmScreen({ overlay: `
  <div class="scrim"></div>
  <div class="glass heavy" style="position:absolute;z-index:220;left:72px;right:72px;top:${40 + 28}px;bottom:28px;border-radius:30px;display:flex;overflow:hidden">
    <aside style="width:264px;flex-shrink:0;padding:20px 12px 14px;display:flex;flex-direction:column;background:rgba(255,255,255,0.035);border-right:0.5px solid rgba(255,255,255,0.08)">
      <div style="padding:0 8px"><div style="font-size:18px;font-weight:700;letter-spacing:-0.02em">Kullanıcı Ayarları</div><div style="font-size:12px;color:var(--t3);margin-top:2px">Descall hesabını yönet</div></div>
      <div class="card" style="margin:14px 0 6px;padding:10px;display:flex;align-items:center;gap:10px">${av("me", 40, "online", "", "#2a2c3e")}<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:650">Demir Sarp</div><div style="font-size:12px;color:var(--t3)">@demir</div></div><span class="ttag" style="background:rgba(255,201,77,0.16);color:var(--gold);height:22px;display:inline-flex;align-items:center;gap:4px">◈ 1.250</span></div>
      ${NAV.map(([g, items]) => `<div class="sect" style="padding:12px 8px 4px">${g}</div>${items.map(([ic, l, id, r]) => `
        <div style="height:36px;display:flex;align-items:center;gap:10px;padding:0 10px;border-radius:12px;font-size:14px;${id === active ? "background:rgba(88,122,246,0.26);color:#fff;font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,0.1),inset 0 0 0 0.5px rgba(143,166,255,0.4)" : "color:var(--t2)"}">${I[ic]}<span style="flex:1">${l}</span>${r ? `<span style="font-size:12px;color:var(--t3)">${r}</span>` : ""}</div>`).join("")}`).join("")}
      <div style="flex:1"></div>
      <div style="height:38px;display:flex;align-items:center;gap:10px;padding:0 10px;border-radius:12px;font-size:14px;color:#ff6961;font-weight:600">${I.logout}Çıkış Yap</div>
    </aside>
    <section style="flex:1;min-width:0;position:relative;overflow:hidden">
      <div style="display:flex;align-items:flex-start;gap:12px;padding:24px 28px 0"><div style="flex:1"><h2 style="font-size:28px;font-weight:700;letter-spacing:-0.035em">${title}</h2><p style="font-size:13.5px;color:var(--t2);margin-top:4px;max-width:640px;line-height:19px">${sub}</p></div>${headRight}<span class="xbtn glass-chip" title="Kapat" style="width:34px;height:34px;border-radius:17px">${I.x}</span></div>
      <div style="padding:20px 28px 28px">${content}</div>
      ${footer}
    </section>
  </div>` });
}
const row = (ic, title, sub, right, { tint = "rgba(88,122,246,0.22)", col = "var(--brand-hi)" } = {}) => `
  <div class="grow">${ic ? `<span class="gi" style="width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:${tint};color:${col}">${I[ic]}</span>` : ""}
    <div style="flex:1;min-width:0;padding:10px 0"><div style="font-size:14px;font-weight:600">${title}</div>${sub ? `<div style="font-size:12.5px;color:var(--t3);margin-top:1px">${sub}</div>` : ""}</div>${right}</div>`;
const H = (t) => `<div class="mhead" style="padding:18px 4px 8px">${t}</div>`;

// 13a Hesabım
S["13a-settings-account"] = settings("account", "Hesabım", "Descall hesabını yönet", `
  <div class="card" style="overflow:hidden;padding:0">
    ${banner(110).replace("#ff7a7f", "#6c86ff").replace("#8a5cf6", "#d6457a")}
    <div style="display:flex;align-items:flex-end;gap:16px;padding:0 18px 16px;margin-top:-40px;position:relative">
      <div style="position:relative">${av("me", 88, null, "", "#2a2c3e")}<span class="glass-chip" style="position:absolute;right:0;bottom:0;width:28px;height:28px;border-radius:14px;display:flex;align-items:center;justify-content:center" title="Avatarı değiştir">${I.camera}</span></div>
      <div style="flex:1;padding-bottom:4px"><div style="font-size:21px;font-weight:700;letter-spacing:-0.02em">Demir Sarp</div><div style="font-size:13px;color:var(--t2)">@demir · <span style="color:var(--brand-hi)">Kurucu</span> · 🛠️ Yeni sürüm geliyor</div></div>
      <span class="btn sm tint-brand" style="margin-bottom:6px">${I.pencil}Profili düzenle</span>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1.15fr 1fr;gap:16px;margin-top:16px">
    <div>${H("Hesap ayrıntıları")}
      <div class="card">
        ${row("user", "Kullanıcı adı", "demir", `<span class="btn xs fill">Değiştir</span>`)}
        ${row("mail", "E-posta", "d•••••@gmail.com", `<span class="ttag" style="background:rgba(48,209,88,0.16);color:#7ee2a0">Doğrulandı</span>`)}
        ${row("tag", "Kullanıcı kimliği", "684f…a91c", `<span class="btn xs fill">${I.copy}Kimliği kopyala</span>`)}
        ${row("circleDot", "Durum", "Çevrimiçi", `<span style="color:var(--t3)">${I.chevR}</span>`, { tint: "rgba(48,209,88,0.18)", col: "#7ee2a0" })}
      </div></div>
    <div>${H("Valorant")}
      <div class="card pad">
        <div style="display:flex;align-items:center;gap:10px"><span class="gi" style="width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(255,70,85,0.18);color:#ff8a93">${I.play}</span><div><div style="font-size:14px;font-weight:600">Riot hesabını bağla</div><div style="font-size:12.5px;color:var(--t3)">Rankın profilinde görünsün</div></div></div>
        <div class="flabel" style="margin-top:14px">Riot ID</div><div class="field-in"><span class="v">demir#TR1</span></div>
        <div class="flabel" style="margin-top:10px">Bölge</div><div class="field-in"><span class="v">Avrupa (EU)</span><span class="end">${I.chevD}</span></div>
        <span class="btn tint-brand w" style="margin-top:14px">Bağla ve rank getir</span>
      </div></div>
  </div>`);

// 13b Görünüm
const accents = ["#587AF6", "#8a5cf6", "#e0508f", "#ff6b4a", "#ffb340", "#30D158", "#40c8e0"];
S["13b-settings-appearance"] = settings("appearance", "Görünüm", "Descall'ın bu cihazda nasıl görüneceğini seç.", `
  ${H("Tema").replace("padding:18px", "padding:0")}
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">
    ${[["Koyu", "linear-gradient(160deg,#2a2d42,#121320)", true], ["Açık", "linear-gradient(160deg,#f4f5fb,#d9dcef)"], ["Lagoon", "linear-gradient(160deg,#1fb5c9,#0b3a6b)"], ["Emberfall", "linear-gradient(160deg,#ff8a3c,#7a1f2f)"]].map(([n, g, on]) => `
      <div style="border-radius:18px;padding:6px 6px 10px;${on ? "background:rgba(88,122,246,0.18);box-shadow:inset 0 0 0 1.5px rgba(143,166,255,0.9)" : "background:rgba(255,255,255,0.04);box-shadow:inset 0 0 0 0.5px rgba(255,255,255,0.08)"}">
        <div style="height:76px;border-radius:13px;background:${g};position:relative;overflow:hidden;box-shadow:inset 0 0 0 0.5px rgba(255,255,255,0.14)"><i style="position:absolute;left:8px;top:10px;width:40%;height:9px;border-radius:5px;background:rgba(255,255,255,0.35)"></i><i style="position:absolute;right:8px;top:26px;width:46%;height:16px;border-radius:8px;background:rgba(88,122,246,0.85)"></i><i style="position:absolute;left:8px;top:48px;width:52%;height:16px;border-radius:8px;background:rgba(255,255,255,0.22)"></i></div>
        <div style="font-size:13px;font-weight:600;margin-top:8px;padding-left:4px;display:flex;align-items:center;gap:6px">${n}${on ? `<span style="color:var(--brand-hi);margin-left:auto;display:flex">${L("circle-check", "sm")}</span>` : ""}</div></div>`).join("")}
    <div style="border-radius:18px;border:1.5px dashed rgba(255,255,255,0.18);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--t2);font-size:12.5px;font-weight:600;text-align:center;padding:8px">${I.bag}Mağazadan daha fazlasını al</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div>${H("Vurgu rengi")}<div class="card pad" style="display:flex;gap:12px">${accents.map((c, i) => `<span style="width:32px;height:32px;border-radius:16px;background:${c};box-shadow:${i === 0 ? "0 0 0 2px #23253a,0 0 0 4px #fff" : "inset 0 0 0 0.5px rgba(255,255,255,0.3)"}"></span>`).join("")}</div>
      ${H("Sohbet yazı boyutu")}<div class="card pad"><div style="display:flex;align-items:center;gap:12px"><span style="font-size:12px;color:var(--t3)">A</span><div style="flex:1;height:4px;border-radius:2px;background:linear-gradient(90deg,var(--brand) 45%,rgba(255,255,255,0.15) 45%);position:relative"><i style="position:absolute;left:45%;top:-9px;width:22px;height:22px;margin-left:-11px;border-radius:11px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></i></div><span style="font-size:18px;color:var(--t2)">A</span><b style="font-size:13px;font-variant-numeric:tabular-nums;width:36px;text-align:right">15 px</b></div><p style="font-size:15px;margin-top:14px;color:var(--t2)">Hızlı kahverengi tilki tembel köpeğin üstünden atlar</p></div>
      ${H("Yoğunluk")}<div class="seg glass-chip"><div>Kompakt</div><div class="lens">Rahat</div><div>Geniş</div></div></div>
    <div>${H("Mesaj balonları")}<div class="seg glass-chip"><div class="lens">Modern</div><div>Klasik</div><div>Sade</div></div>
      <div class="card pad" style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;gap:8px;align-items:flex-end">${av("ayse", 28)}<div class="bub" style="max-width:none">Selam — nasıl gidiyor?</div></div>
        <div style="display:flex;justify-content:flex-end"><div class="bub" style="background:linear-gradient(180deg,rgba(88,122,246,0.55),rgba(88,122,246,0.38));box-shadow:inset 0 1px 0 rgba(255,255,255,0.18),inset 0 0 0 0.5px rgba(143,166,255,0.4)">İyidir! Sen?</div></div>
      </div></div>
  </div>`);

// 13c Bildirimler
S["13c-settings-notifications"] = settings("notifications", "Bildirimler", "Masaüstü ve tarayıcı uyarılarını yönet.", `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div>${H("Bildirimler").replace("padding:18px", "padding:0")}
      <div class="card">
        ${row("chat", "Mesaj bildirimleri", "DM, grup mesajları ve bahsetmeler", `<span class="toggle on"></span>`)}
        ${row("calls", "Arama bildirimleri", "Gelen sesli ve görüntülü aramalar", `<span class="toggle on"></span>`, { tint: "rgba(48,209,88,0.18)", col: "#7ee2a0" })}
      </div>
      ${H("Ses Efektleri")}
      <div class="card">
        ${row("volume", "Mesaj sesleri", "Yeni mesaj geldiğinde ses çal", `<span class="toggle on"></span>`, { tint: "rgba(255,159,10,0.18)", col: "#ffbf5c" })}
        ${row("bellRing", "Arama sesleri", "Zil ve arama bağlantı sesleri", `<span class="toggle"></span>`, { tint: "rgba(255,159,10,0.18)", col: "#ffbf5c" })}
      </div>
    </div>
    <div>${H("Aktivite durumu").replace("padding:18px", "padding:0")}
      <div class="card">
        ${row("gamepad", "Oyun aktivitesi", "Oynadığın oyunu arkadaşlarına göster", `<span class="toggle on"></span>`, { tint: "rgba(155,133,255,0.2)", col: "#c3b5ff" })}
        ${row("laptop", "Uygulama aktivitesi", "Açık uygulamalarını arkadaşlarına göster", `<span class="toggle"></span>`, { tint: "rgba(155,133,255,0.2)", col: "#c3b5ff" })}
        ${row("globe", "Tarayıcı aktivitesi", "Web’de gezinirken arkadaşlarına göster", `<span class="toggle"></span>`, { tint: "rgba(155,133,255,0.2)", col: "#c3b5ff" })}
        ${row("clock", "Descall kullanım süresi", "Descall’da geçirilen süreyi takip et ve göster", `<span class="toggle on focus" style="box-shadow:0 0 0 2px #1d1f2e,0 0 0 4px rgba(143,166,255,0.95)"></span>`, { tint: "rgba(155,133,255,0.2)", col: "#c3b5ff" })}
      </div>
    </div>
  </div>`);

// 13d Ses ve Görüntü
const selectF = (ic, label, v) => `<div><div class="flabel">${label}</div><div class="field-in"><span style="color:var(--t3);display:flex">${I[ic]}</span><span class="v">${v}</span><span class="end">${I.chevD}</span></div></div>`;
S["13d-settings-voice"] = settings("voice", "Ses ve Görüntü", "Bu tarayıcıda aramalar için kullanılacak cihazları seç.", `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div>
      <div class="card pad" style="display:flex;flex-direction:column;gap:14px">
        ${selectF("mic", "Mikrofon", "Mikrofon (HyperX QuadCast S)")}
        ${selectF("headphones", "Konuşmacı", "Sistem varsayılanı")}
        ${selectF("video", "Kamera", "Logitech C920 HD Pro")}
        <span class="btn sm fill" style="align-self:flex-start">${I.refresh}Cihazları yenile</span>
      </div>
    </div>
    <div>
      <div class="card pad">
        <div style="font-size:14px;font-weight:600">Mikrofon testi</div>
        <div style="display:flex;gap:3px;align-items:flex-end;height:40px;margin:16px 0">${Array.from({ length: 34 }, (_, i) => { const h = [8, 14, 22, 30, 36, 28, 18, 26, 34, 38, 30, 20, 12, 18, 26, 32, 24, 16, 10, 8, 6, 6, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4][i]; return `<i style="flex:1;height:${h}px;border-radius:2px;background:${i < 20 ? (h > 30 ? "#ffd60a" : "#30D158") : "rgba(255,255,255,0.14)"}"></i>`; }).join("")}</div>
        <span class="btn sm danger">${I.square}Durdur</span>
      </div>
      ${H("Gürültü engelleme")}
      <div class="card">
        ${row("sparkles", "Yapay zekâ gürültü engelleme", "", `<span class="toggle on"></span>`, { tint: "rgba(48,209,88,0.18)", col: "#7ee2a0" })}
        ${row("", "Aktif motor", "", `<span class="ttag" style="background:rgba(48,209,88,0.16);color:#7ee2a0">Hazır</span>`)}
      </div>

</div>
    </div>
  </div>`);

// 12c Profil düzenle (Ayarlar › Profil) with unsaved bar
S["12c-edit-profile"] = settings("profile", "Profil", "Başkalarının Descall'da sizi nasıl gördüğünü güncelleyin.", `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div class="card" style="overflow:hidden;padding:0;align-self:start">
      <div class="flabel" style="position:absolute;margin:12px 0 0 14px;z-index:2;color:rgba(255,255,255,0.85)">Banner</div>
      <div style="height:132px;position:relative;background:radial-gradient(80% 140% at 15% 10%,#6c86ff,transparent 60%),radial-gradient(80% 140% at 90% 90%,#d6457a,transparent 60%),#22243a">
        <div style="position:absolute;right:12px;bottom:12px;display:flex;gap:8px"><span class="btn xs glass-chip" title="Banner'ı kaldır" style="width:28px;padding:0;color:#ff8a82">${I.trash}</span><span class="btn xs glass-chip">${I.image}Banner'ı değiştir</span></div>
      </div>
      <div style="padding:0 18px 18px;margin-top:-40px;position:relative">
        <div style="display:flex;align-items:flex-end;gap:14px"><div style="position:relative">${av("me", 84, null, "", "#26283a")}<span class="glass-chip" style="position:absolute;right:0;bottom:0;width:28px;height:28px;border-radius:14px;display:flex;align-items:center;justify-content:center" title="Avatarı değiştir">${I.camera}</span></div>
          <div style="padding-bottom:4px"><div style="font-size:20px;font-weight:700;letter-spacing:-0.02em">Demir Sarp</div><div style="font-size:13px;color:var(--t2)">@demir</div></div></div>
        <span class="chip" style="margin-top:12px;height:28px"><span style="width:8px;height:8px;border-radius:4px;background:var(--ok)"></span>🛠️ Yeni sürüm geliyor</span>
        <div class="flabel" style="margin-top:14px">Hakkımda</div>
        <div style="font-size:13.5px;line-height:20px;color:var(--t1)">Descall’ın kurucusu. Akşamları ranked, gece kod 🌙</div>
        <div style="display:flex;gap:8px;margin-top:16px"><span class="btn xs tint-brand">${I.upload}Fotoğrafı değiştir</span><span class="btn xs fill" style="color:#ff8a82">Fotoğrafı kaldır</span></div>
        <p class="hint" style="margin-top:8px">JPG, PNG, WebP veya GIF, en fazla 8 MB. GIF'ler hareketli kalır.</p>
      </div>
    </div>
    <div>
      ${H("Kimlik").replace("padding:18px", "padding:0")}
      <div class="flabel">Görünen ad</div><div class="field-in focus"><span class="v">Demir Sarp</span></div>
      <div class="flabel" style="margin-top:14px">Biyografi</div><div class="field-in" style="height:88px;align-items:flex-start;padding-top:12px"><span class="v">Descall’ın kurucusu. Akşamları ranked, gece kod 🌙</span></div>
      <div class="flabel" style="margin-top:14px">Özel durum</div><div style="display:flex;gap:8px"><div class="field-in" style="width:52px;justify-content:center;padding:0;font-size:18px" title="Durum Emojisi">🛠️</div><div class="field-in" style="flex:1"><span class="v">Yeni sürüm geliyor</span></div></div>
    </div>
  </div>`, { footer: `
  <div class="glass heavy" style="position:absolute;left:28px;right:28px;bottom:20px;height:60px;border-radius:30px;display:flex;align-items:center;gap:12px;padding:0 10px 0 20px">
    <span style="color:var(--gold);display:flex">${I.alert}</span><span style="flex:1;font-size:14px;font-weight:600">Kaydedilmemiş değişiklikler var</span><span class="btn fill">İptal</span><span class="btn tint-brand">Kaydet</span></div>` });

// ── 14 Announcements modal + toasts ──
const ann = `
  <div class="scrim"></div>
  <div class="modal glass heavy" style="left:50%;top:calc(50% + 20px);transform:translate(-50%,-50%);width:560px">
    <div class="modal-h"><span class="gi" style="width:40px;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center;background:rgba(255,69,58,0.18);color:#ff8a82;margin-right:12px">${I.megaphone}</span><div style="flex:1"><h3>Duyurular</h3></div><span class="xbtn">${I.x}</span></div>
    <div style="padding:14px 18px 20px;display:flex;flex-direction:column;gap:10px">
      ${[["Yeni: Liquid Glass tasarım 🎉", "Masaüstü ve web uygulaması yeni buzlu cam görünümüne geçiyor. Ayarlar › Görünüm’den temanı seçebilirsin.", "Demir Sarp", "11 Eki 2026", true],
        ["Yapay zekâ gürültü engelleme", "Seste klavye ve fan sesi artık otomatik bastırılıyor. Ses ve Görüntü ayarlarından kapatabilirsin.", "Demir Sarp", "2 Eki 2026"],
        ["Arkadaşını davet et, DesCoin kazan", "Davet linkinle kayıt olan her arkadaş için sen 100, o 50 DesCoin kazanır.", "Descall Ekibi", "24 Eyl 2026"]].map(([t, b, a, d, n]) => `
        <div class="card" style="padding:14px 16px;${n ? "background:rgba(88,122,246,0.12);box-shadow:inset 0 0 0 0.5px rgba(143,166,255,0.35)" : ""}">
          <div style="display:flex;align-items:center;gap:8px"><b style="font-size:15px;font-weight:650;flex:1">${t}</b></div>
          <p style="font-size:13.5px;line-height:20px;color:var(--t2);margin-top:6px">${b}</p>
          <div style="font-size:12px;color:var(--t3);margin-top:8px">${a} tarafından · ${d}</div></div>`).join("")}
    </div>
  </div>`;
const toastsBR = `
  <div class="toast glass heavy" style="right:24px;bottom:${100 + 76 + 76}px">${av("elif", 32, "online", "", "#2a2c3e")}<div class="tb"><b>Elif</b><span>şimdi çevrimiçi</span></div><span class="tx">${I.x}</span></div>
  <div class="toast glass heavy" style="right:24px;bottom:${100 + 76}px"><span class="ti" style="background:rgba(48,209,88,0.2);color:#7ee2a0">${I.check}</span><div class="tb"><b>Davet linki kopyalandı</b></div><span class="tx">${I.x}</span></div>
  <div class="toast glass heavy" style="right:24px;bottom:100px;width:380px;flex-wrap:wrap"><span class="ti" style="background:rgba(88,122,246,0.24);color:var(--brand-hi)">${I.refresh}</span><div class="tb"><b>Masaüstü güncelleme</b><span>İndiriliyor… %64</span><div style="height:4px;border-radius:2px;margin-top:6px;background:linear-gradient(90deg,var(--brand) 64%,rgba(255,255,255,0.14) 64%)"></div></div><span class="btn xs fill" style="opacity:0.5">Şimdi yeniden başlat</span></div>`;
S["14-announcements"] = dmScreen({ overlay: ann });
S["14b-toasts"] = dmScreen({ overlay: toastsBR });

export default S;
