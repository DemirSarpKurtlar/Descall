import { win, rail, sideHeader, chead, av, gav, AV, I, L, bgroup, GROUP_GRAD, GROUP2_GRAD } from "./shared.mjs";
import { dmScreen } from "./screens-a.mjs";
import { serverScreen } from "./screens-b.mjs";
import { settings } from "./screens-d.mjs";
const S = {};
const pill = (html, style = "") => `<span class="glass-chip" style="height:26px;border-radius:13px;padding:0 10px;display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--t2);${style}">${html}</span>`;
const RANK = { d: ["Elmas", "#c08bff"], a: ["Yükselen", "#3fd28b"], p: ["Platin", "#45c4d6"], g: ["Altın", "#e8b94a"], i: ["Ölümsüz", "#ff5c7a"] };
const rk = (r, n) => `<span style="display:inline-flex;align-items:center;gap:4px;font-weight:650;color:${RANK[r][1]}">${L("gem", "sm")}${RANK[r][0]} ${n}</span>`;

// ── 15 Play / LFG ──
const lobby = (o) => `
  <div class="card" style="padding:14px 14px 12px;${o.sel ? "background:rgba(88,122,246,0.16);box-shadow:inset 0 0 0 1px rgba(143,166,255,0.55),inset 0 1px 0 rgba(255,255,255,0.10)" : ""}">
    <div style="display:flex;align-items:center;gap:8px"><b style="font-size:15px;font-weight:650">${o.mode}</b><span style="font-size:12.5px;color:var(--t3)">· ${o.region}</span><span style="flex:1"></span>
      <span style="display:flex;gap:3px">${Array.from({ length: 5 }, (_, i) => `<i style="width:8px;height:8px;border-radius:4px;background:${i < o.slots ? "var(--brand-hi)" : "rgba(255,255,255,0.16)"}"></i>`).join("")}</span><b style="font-size:12.5px;font-variant-numeric:tabular-nums">${o.slots}/5</b></div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12.5px">${rk(o.r1, o.n1)}<span style="color:var(--t4)">—</span>${rk(o.r2, o.n2)}</div>
    <p style="font-size:13px;color:var(--t2);margin-top:8px">${o.note}</p>
    <div style="display:flex;align-items:center;gap:6px;margin-top:10px">${av(o.host, 22)}<span style="font-size:12.5px;color:var(--t2);flex:1">${AV[o.host].name}</span>
      ${o.mic ? pill(`${L("mic", "sm")}Mikrofon`) : ""}${o.code ? pill(`${L("key-round", "sm")}Kod ayarlı`) : ""}
      ${o.sel ? "" : `<span class="btn xs tint-brand">Katıl</span>`}</div>
  </div>`;
const player = (k, role, r, n, me = false) => `
  <div class="grow">${av(k, 36, "online", "", "#25273a")}<div style="flex:1;padding:10px 0"><div style="font-size:14px;font-weight:600">${AV[k].name}${me ? `<span style="color:var(--t3);font-weight:500"> (sen)</span>` : ""}</div><div style="font-size:12px;color:var(--t3)">${role}</div></div>${rk(r, n)}</div>`;
S["15-play-lfg"] = win(`
  <div class="app">
    ${rail("play")}
    <aside class="side glass panel" style="width:400px">
      <div style="display:flex;align-items:center;gap:10px;padding:16px 14px 0 14px">
        <span class="cbtn glass-chip" style="width:34px;height:34px;border-radius:17px" title="Descall'a Dön">${I.arrowL}</span>
        <div style="flex:1"><div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#ff6b7a">VALORANT</div><div style="font-size:22px;font-weight:700;letter-spacing:-0.025em;line-height:26px">Takım bul</div></div>
        <span class="btn sm tint-brand">${I.plus}Oluştur</span>
      </div>
      <div style="padding:14px 14px 4px"><div class="flabel" style="margin-bottom:8px">Filtreler</div>
        <div class="chips"><span class="chip">Tüm modlar${I.chevD}</span><span class="chip">Tüm bölgeler${I.chevD}</span><span class="chip on">${I.check}Rankım (filtre)</span><span class="chip">${I.mic}Mikrofon zorunlu</span></div></div>
      <div style="padding:10px 14px;display:flex;flex-direction:column;gap:10px;overflow:hidden">
        ${lobby({ mode: "Dereceli", region: "EU", slots: 3, r1: "p", n1: 2, r2: "d", n2: 1, note: "Akşam rank push, sakin oyuncular 🎯", host: "ayse", mic: true, code: true, sel: true })}
        ${lobby({ mode: "Derecesiz", region: "EU", slots: 2, r1: "g", n1: 1, r2: "p", n2: 3, note: "chill, sadece TR", host: "kaan", mic: true })}
        ${lobby({ mode: "Spike Rush", region: "EU", slots: 4, r1: "g", n1: 3, r2: "a", n2: 1, note: "Isınma maçı, 1 kişi lazım", host: "can", code: true })}
      </div>
    </aside>
    <main class="main" style="overflow:hidden">
      <div style="padding:24px 28px">
        <div style="display:flex;align-items:center;gap:10px"><span class="ttag" style="background:rgba(48,209,88,0.16);color:#7ee2a0;height:24px;display:inline-flex;align-items:center">Lobi · açık</span><span style="font-size:13px;color:var(--t3)">Dereceli · EU</span></div>
        <div style="display:flex;align-items:flex-end;gap:16px;margin-top:10px"><h1 style="font-size:30px;font-weight:700;letter-spacing:-0.035em;flex:1">Akşam rank push</h1>
          <div style="text-align:right"><div style="font-size:12px;color:var(--t3)">Slot</div><div style="font-size:24px;font-weight:700;font-variant-numeric:tabular-nums">3<span style="color:var(--t3)">/5</span></div></div></div>
        <p style="font-size:14px;color:var(--t2);margin-top:6px">Not: Akşam rank push, sakin oyuncular 🎯</p>
        <div style="display:grid;grid-template-columns:1.25fr 1fr;gap:20px;margin-top:20px">
          <div><div class="mhead" style="padding:0 4px 8px">Oyuncular</div>
            <div class="card">${player("ayse", "Ev sahibi · Kontrol Uzmanı", "d", 1)}${player("me", "Düellocu", "p", 3, true)}${player("elif", "Gözcü", "p", 2)}</div></div>
          <div>
            <div class="mhead" style="padding:0 4px 8px">Valorant parti kodu</div>
            <div class="card pad"><div style="display:flex;align-items:center;gap:10px"><div class="field-in" style="flex:1;font-family:var(--mono);letter-spacing:0.2em;justify-content:center"><span class="v" style="filter:blur(5px)">KX7-29QF</span></div><span class="btn sm fill">${I.eye}Görmek için tıkla</span></div>
              <div style="display:flex;gap:8px;margin-top:10px"><span class="btn xs fill">${I.copy}Kopyala</span><span class="btn xs fill">${I.pencil}Düzenle</span></div></div>
            <div class="mhead" style="padding:16px 4px 8px">Rankın</div>
            <div class="card pad" style="display:flex;align-items:center;gap:10px">${rk("p", 3)}<span style="font-size:12.5px;color:var(--t3)">· demir#TR1</span></div>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:22px"><span class="btn tint-green">${I.volume}Sese katıl</span><span class="btn glass-chip">${I.chat}Sohbeti aç</span><span style="flex:1"></span><span class="btn danger">${I.logout}Ayrıl</span></div>
      </div>
    </main>
  </div>`);

// ── 16 Activity ──
const actRow = (k, st, title, sub, ic = "gamepad") => `<div class="row" style="min-height:56px">${av(k, 40, st)}<div class="body"><div class="top"><span class="t">${AV[k].name}</span></div><div class="bot"><span class="s" style="display:flex;align-items:center;gap:5px"><span style="color:var(--brand-hi);display:flex">${L(ic === "music" ? "music" : ic === "code" ? "code" : "gamepad-2", "sm")}</span>${title}</span></div></div><span style="font-size:11.5px;color:var(--t3)">${sub}</span></div>`;
S["16-activity"] = win(`
  <div class="app">
    ${rail("activity")}
    <aside class="side glass panel">
      ${sideHeader("Aktivite", { sub: "Varlığın ve geçmişin", buttons: [["search", { t: "Ara" }], ["feedback", { t: "Geri Bildirim Gönder" }]], plus: true, search: null })}
      <div class="side-body" style="padding-top:8px">
        <div class="card" style="margin:4px 4px 10px;padding:12px">
          <div style="display:flex;align-items:center;gap:10px">${av("me", 40, "online", "", "#25273a")}<div style="flex:1"><div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:var(--t3)">DURUMUN</div><div style="font-size:14px;font-weight:650">Kod yazıyor</div></div></div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:10px"><span style="font-size:12px;color:var(--t3);display:flex;align-items:center;gap:5px;flex:1;white-space:nowrap">${L("eye", "sm")}Arkadaşlara görünür</span><span class="btn xs fill">Durum Ayarla</span></div>
        </div>
        <div class="seg glass-chip" style="margin:0 4px 6px"><div class="lens">Arkadaşlar</div><div>Geçmiş</div></div>
        <div class="sect">4 çevrimiçi</div>
        <div class="sect" style="padding-top:2px">Şu an aktif — 3</div>
        ${actRow("elif", "online", "Valorant", "1 sa 12 dk")}
        ${actRow("can", "dnd", "Spotify", "18 dk", "music")}
        ${actRow("kaan", "online", "Visual Studio Code", "42 dk", "code")}
        <div class="sect" style="padding-top:10px">Çevrimiçi — 1</div>
        <div class="row" style="min-height:56px">${av("ayse", 40, "online")}<div class="body"><div class="top"><span class="t">Ayşe Yılmaz</span></div><div class="bot"><span class="s">Çevrimiçi</span></div></div></div>
      </div>
    </aside>
    <main class="main" style="overflow:hidden">
      <div style="padding:24px 28px">
        <div style="display:flex;align-items:flex-start;gap:12px"><div style="flex:1"><h1 style="font-size:30px;font-weight:700;letter-spacing:-0.035em">Aktivite</h1><p style="font-size:13.5px;color:var(--t2);margin-top:4px">Varlığın ve geçmişin</p></div>
          <div class="seg glass-chip" style="width:auto;grid-auto-columns:auto;white-space:nowrap"><div class="lens">${I.users}Arkadaşlara görünür</div><div>${I.user}Sadece ben</div><div>${I.eyeOff}Gizli</div></div>
          <span class="btn tint-brand">Durum Ayarla</span></div>
        <div class="glass" style="margin-top:22px;border-radius:26px;padding:20px 22px;display:flex;align-items:center;gap:18px;position:relative;overflow:hidden">
          <div style="position:absolute;inset:0;background:radial-gradient(60% 120% at 0% 0%,rgba(88,122,246,0.28),transparent 60%)"></div>
          <span style="position:relative;width:64px;height:64px;border-radius:20px;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,#6c86ff,#8a5cf6);box-shadow:inset 0 1px 0 rgba(255,255,255,0.3),0 10px 24px rgba(88,122,246,0.4)">${L("code", "lg")}</span>
          <div style="position:relative;flex:1"><div style="font-size:11.5px;font-weight:700;letter-spacing:0.06em;color:#7ee2a0;display:flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:4px;background:#30D158;box-shadow:0 0 8px #30D158"></span>ŞU AN AKTİF</div><div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin-top:4px">Kod yazıyor</div><div style="font-size:13px;color:var(--t2);margin-top:2px">Başlangıç 23:10 · 1 sa 24 dk</div></div>
          <span class="btn fill" style="position:relative">${I.x}Manuel durumu temizle</span>
        </div>
        <div class="seg glass-chip" style="width:260px;margin-top:22px"><div class="lens">Geçmiş</div><div>Arkadaşlar</div></div>
        <div class="card" style="margin-top:14px">
          ${[["gamepad-2", "Valorant", "Bugün · 21:00 – 22:48", "1 sa 48 dk", "#ff6b7a"], ["code", "Kod yazıyor", "Bugün · 23:10 – şimdi", "1 sa 24 dk", "#8FA6FF"], ["music", "Müzik Dinliyor", "Dün · 19:20 – 20:05", "45 dk", "#30D158"], ["book-open", "Ders çalışıyor", "Dün · 14:00 – 16:30", "2 sa 30 dk", "#ffc94d"]].map(([ic, t, s, d, c]) => `
            <div class="grow"><span style="width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.07);color:${c}">${L(ic)}</span><div style="flex:1;padding:12px 0"><div style="font-size:14px;font-weight:600">${t}</div><div style="font-size:12.5px;color:var(--t3)">${s}</div></div><b style="font-size:13px;font-weight:650;font-variant-numeric:tabular-nums;color:var(--t2)">${d}</b></div>`).join("")}
        </div>
      </div>
    </main>
  </div>`);

// ── 17 Calls history ──
const callRow = (who, kind, dir, when, dur, { missed = false, groupG = null, n = 0 } = {}) => `
  <div class="grow" style="min-height:64px">${groupG ? gav("AE", groupG, 42) : av(who, 42)}
    <div style="flex:1;padding:12px 0"><div style="font-size:14.5px;font-weight:600;${missed ? "color:#ff6961" : ""}">${groupG ? who : AV[who].name}${n ? `<span style="color:var(--t3);font-weight:500;font-size:12.5px"> · ${n} kişi</span>` : ""}</div>
      <div style="font-size:12.5px;color:var(--t3);display:flex;align-items:center;gap:5px"><span style="display:flex;color:${missed ? "#ff6961" : dir === "in" ? "#7ee2a0" : "var(--brand-hi)"}">${L(missed ? "phone-missed" : dir === "in" ? "phone-incoming" : "phone-outgoing", "sm")}</span>${kind} · ${when}${dur ? ` · ${dur}` : ""}</div></div>
    ${groupG ? `<span class="ib glass-chip" title="Grup sesli araması başlat">${I.calls}</span><span class="ib glass-chip" title="Grup görüntülü araması başlat">${I.video}</span>` : `<span class="ib glass-chip" title="Geri ara">${I.calls}</span><span class="ib glass-chip" title="Görüntülü arama">${I.video}</span>`}
  </div>`;
S["17-calls"] = win(`
  <div class="app">
    ${rail("calls")}
    <aside class="side glass panel">
      ${sideHeader("Aramalar")}
      <div class="side-body"><div class="sect">Arkadaşlar<span class="sp"></span>${I.chevD}</div>
        ${[["ayse", "online", "Çevrimiçi"], ["elif", "online", "🎮 Valorant oynuyor"], ["mert", "idle", "Boşta"], ["can", "dnd", "Rahatsız Etme"], ["kaan", "online", "Çevrimiçi"], ["burak", "off", "Çevrimdışı"], ["selin", "off", "Çevrimdışı"]].map(([k, st, l], i) => `<div class="row ${i === 0 ? "hov" : ""}" style="min-height:56px;${st === "off" ? "opacity:0.62" : ""}">${av(k, 40, st)}<div class="body"><div class="top"><span class="t">${AV[k].name}</span></div><div class="bot"><span class="s">${l}</span></div></div></div>`).join("")}
      </div>
    </aside>
    <main class="main" style="overflow:hidden">
      <div style="padding:24px 28px">
        <div style="display:flex;align-items:flex-start;gap:12px"><div style="flex:1"><h1 style="font-size:30px;font-weight:700;letter-spacing:-0.035em">Aramalar</h1><p style="font-size:13.5px;color:var(--t2);margin-top:4px">Arkadaşlarını hızlı ara veya son DM & grup aramalarına dön.</p></div><span class="btn glass-chip">${I.refresh}Yenile</span></div>
        <div class="mhead" style="padding:22px 4px 10px">Hızlı ara <span style="color:var(--t3);font-weight:600;letter-spacing:0">· 4 çevrimiçi</span></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
          ${["ayse", "elif", "kaan", "mert"].map((k) => `<div class="glass" style="border-radius:22px;padding:14px;display:flex;flex-direction:column;align-items:center;gap:8px">${av(k, 52, k === "mert" ? "idle" : "online", "", "#2a2c3e")}<div style="font-size:14px;font-weight:650;cursor:pointer" title="${AV[k].name} ile sohbeti aç">${AV[k].name}</div><div style="display:flex;gap:8px"><span class="ib tint-green" title="Sesli arama" style="width:36px;height:36px;border-radius:18px">${I.calls}</span><span class="ib brand" title="Görüntülü arama" style="width:36px;height:36px;border-radius:18px">${I.video}</span></div></div>`).join("")}
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:22px 4px 10px"><div class="mhead" style="padding:0;flex:1">Son <span style="color:#ff6961;letter-spacing:0">· 2 cevapsız</span></div>
          <div class="chips"><span class="chip on">Tümü</span><span class="chip">Cevapsız</span><span class="chip">Gelen</span><span class="chip">Giden</span><span class="chip">Grup</span></div>
          <div class="search glass-chip" style="margin:0;width:200px">${I.search}<span>Arama ara</span></div></div>
        <div class="card">
          ${callRow("ayse", "Sesli arama", "out", "Bugün 20:47", "12 dk 40 sn")}
          ${callRow("Akşam Ekibi", "Sesli arama", "in", "Bugün 18:36", "1 sa 4 dk", { groupG: GROUP_GRAD, n: 5 })}
          ${callRow("deniz", "Sesli arama", "in", "Dün 22:10", "", { missed: true })}
          ${callRow("elif", "Görüntülü arama", "in", "Dün 19:02", "24 dk")}
          ${callRow("mert", "Sesli arama", "in", "Pzt 23:41", "", { missed: true })}
        </div>
      </div>
    </main>
  </div>`);

// ── 18 Shop (Ayarlar › Mağaza) ──
const TABS = [["image", "Bannerlar"], ["circle-dot", "Çerçeveler"], ["wallpaper", "Arkaplanlar"], ["palette", "Temalar"], ["award", "Rozetler"], ["tag", "Unvanlar"], ["type", "İsim Efektleri"], ["sparkles", "Avatar Efektleri"], ["message-square", "Balonlar"], ["circle-dot", "Durum"], ["sun", "Auralar"], ["ellipsis", "Yazma"], ["flame", "Tepkiler"], ["phone", "Arama Kaplamaları"]];
const theme = (n, g, price, { owned = false, applied = false, isNew = false, rar = "rare", rc = "#45c4d6", desc = "", poor = false } = {}) => `
  <div class="card" style="padding:8px 8px 12px;${applied ? "box-shadow:inset 0 0 0 1.5px rgba(143,166,255,0.9)" : ""}">
    <div style="height:104px;border-radius:14px;background:${g};position:relative;overflow:hidden;box-shadow:inset 0 0 0 0.5px rgba(255,255,255,0.16)">
      <i style="position:absolute;left:10px;top:12px;width:38%;height:10px;border-radius:5px;background:rgba(255,255,255,0.35)"></i><i style="position:absolute;right:10px;top:32px;width:44%;height:18px;border-radius:9px;background:rgba(255,255,255,0.28);backdrop-filter:blur(6px)"></i><i style="position:absolute;left:10px;top:58px;width:50%;height:18px;border-radius:9px;background:rgba(0,0,0,0.22)"></i>
      ${isNew ? `<span class="badge" style="position:absolute;top:8px;right:8px">Yeni</span>` : ""}
    </div>
    <div style="padding:10px 4px 0"><div style="display:flex;align-items:center;gap:6px"><b style="font-size:14px;font-weight:650;flex:1">${n}</b><span style="font-size:10.5px;font-weight:700;letter-spacing:0.04em;color:${rc}">${rar.toUpperCase()}</span></div>
      <p style="font-size:12px;color:var(--t3);margin-top:3px;height:32px;line-height:16px">${desc}</p>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px">${owned ? `<span style="font-size:12px;color:#7ee2a0;font-weight:650;flex:1">Sahip Olundu</span>${applied ? `<span class="btn xs fill">Kaldır</span>` : `<span class="btn xs tint-brand">Uygula</span>`}` : `<span style="font-size:13px;font-weight:700;color:var(--gold);flex:1">◈ ${price}</span><span class="btn xs ${poor ? "fill" : "tint-brand"}" style="${poor ? "opacity:0.55" : ""}">Satın Al</span>`}</div>
      ${poor ? `<p style="font-size:11px;color:#ff8a82;margin-top:6px">Henüz yeterli DesCoin yok</p>` : ""}</div>
  </div>`;
S["18-shop"] = settings("shop", "Mağaza", "Aramalarda konuşarak, mesajlaşarak ve ekran paylaşarak DesCoin kazan — sonra banner, çerçeve, aura, flare ve daha fazlasına harca.", `
  <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:14px">
    <div class="card" style="padding:14px 16px;background:linear-gradient(135deg,rgba(255,201,77,0.16),rgba(255,255,255,0.03));box-shadow:inset 0 0 0 0.5px rgba(255,201,77,0.3)">
      <div style="display:flex;align-items:center;gap:10px"><span style="width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(255,201,77,0.2);color:var(--gold)">${I.gift}</span><div style="flex:1"><div style="font-size:14.5px;font-weight:650">Günlük ödül</div><div style="font-size:12px;color:var(--t2)">Seri · 6 gün 🔥</div></div><span class="btn sm" style="background:linear-gradient(180deg,#ffd35c,#f0a92a);color:#2a1d00;box-shadow:inset 0 1px 0 rgba(255,255,255,0.5),0 6px 16px rgba(255,201,77,0.35)">60 DesCoin al</span></div>
      <div style="display:flex;gap:10px;margin-top:12px">${[["mic", "Konuşma", 70], ["chat", "Mesaj", 100], ["monitor", "Ekran paylaşımı", 30]].map(([ic, l, p]) => `<div style="flex:1"><div style="font-size:11.5px;color:var(--t2);display:flex;align-items:center;gap:5px">${L(ic === "chat" ? "message-square" : ic, "sm")}${l}</div><div style="height:4px;border-radius:2px;margin-top:6px;background:linear-gradient(90deg,var(--gold) ${p}%,rgba(255,255,255,0.12) ${p}%)"></div></div>`).join("")}</div>
    </div>
    <div class="card" style="padding:14px 16px;display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,rgba(88,122,246,0.2),rgba(255,255,255,0.03));box-shadow:inset 0 0 0 0.5px rgba(143,166,255,0.35)"><div style="flex:1"><div style="font-size:14.5px;font-weight:650">Arkadaş davet et</div><div style="font-size:12px;color:var(--t2)">Sen 100 DesCoin · onlar 50 kazanır</div></div><span class="btn sm tint-brand">${I.copy}Linki kopyala</span></div>
  </div>
  <div style="display:flex;gap:8px;margin-top:16px;overflow:hidden;mask-image:linear-gradient(90deg,#000 88%,transparent)">${TABS.map(([ic, l]) => `<span class="chip ${l === "Temalar" ? "on" : ""}" style="flex-shrink:0">${L(ic, "sm")}${l}</span>`).join("")}</div>
  <div class="mhead" style="padding:16px 4px 10px">Premium Temalar</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
    ${theme("Lagoon", "linear-gradient(160deg,#1fb5c9,#0b3a6b)", 0, { owned: true, applied: true, desc: "Turkuaz lagün ışığı, sakin ve serin." })}
    ${theme("Emberfall", "radial-gradient(80% 90% at 70% 20%,#ffb35c,transparent 60%),linear-gradient(160deg,#ff6a3c,#5a1426)", 0, { owned: true, rar: "epic", rc: "#c08bff", desc: "Hareketli kor yağmuru, sıcak tonlar." })}
    ${theme("Borealis", "radial-gradient(70% 80% at 30% 20%,#5affc8,transparent 60%),linear-gradient(160deg,#1a6b6f,#1a1f4a)", 900, { isNew: true, rar: "epic", rc: "#c08bff", desc: "Kuzey ışıkları, yumuşak dalgalanma." })}
    ${theme("Iriscape", "conic-gradient(from 200deg at 60% 40%,#ff7ad9,#7a8cff,#5ad1ff,#ffd36b,#ff7ad9)", 2400, { rar: "legendary", rc: "#ffc94d", desc: "Yanardöner premium cam, ışıkla değişir.", poor: true })}
  </div>`, { headRight: `<div class="glass" title="DesCoin bakiyen" style="height:38px;border-radius:19px;padding:0 14px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;white-space:nowrap"><span style="color:var(--gold)">◈</span>1.250 <span style="color:var(--t3);font-weight:600">DesCoin</span></div>` });

// ── 19 Status picker (NavigationRail status menu) ──
const statusMenu = `
  <div class="menu glass heavy" style="left:${8 + 72 + 10}px;bottom:16px;width:300px;padding:8px">
    <div class="mhead">Durum ayarla</div>
    ${[["online", "Çevrimiçi", true], ["idle", "Boşta"], ["dnd", "Rahatsız Etme"], ["off", "Görünmez"]].map(([s, l, on]) => `<div class="mi ${on ? "on" : ""}"><span style="width:12px;height:12px;border-radius:6px;margin:0 3px;background:var(--${s});${s === "off" ? "box-shadow:inset 0 0 0 3px var(--off);background:transparent" : ""}"></span>${l}${on ? `<span class="r">${I.check}</span>` : ""}</div>`).join("")}
    <div class="msep"></div>
    <div class="mhead">Özel durum</div>
    <div style="display:flex;gap:8px;padding:0 6px"><div class="field-in" style="width:44px;padding:0;justify-content:center;font-size:17px">🎮</div><div class="field-in focus" style="flex:1"><span class="v">Ranked’dayım, 1 kişi lazım</span></div></div>
    <div style="display:flex;gap:4px;padding:10px 6px 4px">${"💬😀🎮🎵💼📚☕🌙".split("").filter((c) => c.trim()).length ? ["💬", "😀", "🎮", "🎵", "💼", "📚", "☕", "🌙"].map((e) => `<span style="flex:1;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;${e === "🎮" ? "background:rgba(88,122,246,0.3);box-shadow:inset 0 0 0 1px rgba(143,166,255,0.6)" : "background:rgba(255,255,255,0.05)"}">${e}</span>`).join("") : ""}</div>
    <div style="display:flex;justify-content:flex-end;gap:8px;padding:8px 6px 6px"><span class="btn xs fill">İptal</span><span class="btn xs tint-brand">Kaydet</span></div>
    <div class="msep"></div>
    <div class="mi">${I.settings}Kullanıcı Ayarları<span class="r">${I.chevR}</span></div>
  </div>`;
S["19-status-picker"] = dmScreen({ overlay: statusMenu });

// ── 20 Confirm dialog + toast types ──
const confirm = `
  <div class="scrim"></div>
  <div class="modal glass heavy" style="left:50%;top:calc(50% + 20px);transform:translate(-50%,-50%);width:420px;text-align:center;padding:28px 24px 22px">
    <span style="width:56px;height:56px;border-radius:28px;margin:0 auto;display:flex;align-items:center;justify-content:center;background:rgba(255,69,58,0.16);color:#ff6961;box-shadow:inset 0 0 0 0.5px rgba(255,69,58,0.35)">${L("message-square-x")}</span>
    <h3 style="font-size:19px;font-weight:700;letter-spacing:-0.02em;margin-top:14px">Bu sohbeti kapatmak istiyor musun?</h3>
    <p style="font-size:13.5px;line-height:20px;color:var(--t2);margin-top:8px">Sohbet listeden kalkar. Mesajlar durur; karşı taraf yazarsa tekrar görünür.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:22px"><span class="btn fill focus">İptal</span><span class="btn" style="background:linear-gradient(180deg,#ff6259,#e5352b);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,0.3),0 8px 20px rgba(255,69,58,0.35)">Sohbeti kapat</span></div>
  </div>
  ${[["check", "rgba(48,209,88,0.2)", "#7ee2a0", "Profil kaydedildi", ""], ["x", "rgba(255,69,58,0.2)", "#ff8a82", "Mesaj gönderilemedi", "Bağlantını kontrol edip tekrar dene."], ["info", "rgba(88,122,246,0.24)", "var(--brand-hi)", "Davet linki kopyalandı", ""]].map(([ic, bg, c, t, sub], i) => `
  <div class="toast glass heavy" style="right:24px;top:${40 + 16 + i * 76}px"><span class="ti" style="background:${bg};color:${c}">${I[ic]}</span><div class="tb"><b>${t}</b>${sub ? `<span>${sub}</span>` : ""}</div><span class="tx">${I.x}</span></div>`).join("")}
  <div class="toast glass heavy" style="right:24px;top:${40 + 16 + 3 * 76}px">${av("elif", 32, "online", "", "#2a2c3e")}<div class="tb"><b>Elif</b><span>şimdi çevrimiçi</span></div><span class="tx">${I.x}</span></div>`;
S["20-confirm-toasts"] = dmScreen({ overlay: confirm, sideOpts: { sel: "ayse", more: "zeynep" } });

// ── 21a Web app in a browser frame ──
S["21a-web-inner"] = serverScreen({}).replace('<div class="win ', '<div class="win web ').replace(/<div class="titlebar">[\s\S]*?<\/div><\/div>/, "")
  .replace("</head>", `<style>html,body,.win{width:1440px!important;height:809px!important}.win.web .app{top:58px}</style></head>`)
  .replace('<div class="app">', `<div class="glass" style="position:absolute;z-index:40;top:8px;left:8px;right:8px;height:42px;border-radius:21px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:13.5px;font-weight:550;background:linear-gradient(90deg,rgba(88,122,246,0.20),rgba(88,122,246,0.10))"><span style="display:flex;color:var(--brand-hi)">${L("bell", "sm")}</span>Mesaj, arama ve mention bildirimleri almak için izin verin<span class="btn xs tint-brand" style="margin-left:6px">İzin ver</span><span class="xbtn" style="width:26px;height:26px">${L("x", "sm")}</span></div><div class="app">`);
S["21a-web-browser"] = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><link rel="stylesheet" href="../desktop.css"/>
<style>
  body{background:radial-gradient(60% 70% at 20% 10%,#2b3a7a,transparent 60%),radial-gradient(60% 70% at 90% 90%,#5a2a6f,transparent 60%),#0b0c12}
  .bw{position:absolute;left:40px;top:28px;width:1360px;height:844px;border-radius:14px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.10)}
  .bchrome{height:80px;background:linear-gradient(180deg,#2a2c38,#23252f);border-bottom:1px solid rgba(0,0,0,0.4);position:relative}
  .tabs{height:40px;display:flex;align-items:flex-end;padding:0 10px;gap:2px}
  .tab{height:32px;border-radius:10px 10px 0 0;padding:0 12px;display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,0.65);width:230px}
  .tab.on{background:#30323f;color:#fff}
  .tab img{width:16px;height:16px;border-radius:4px}
  .url{position:absolute;left:120px;right:120px;top:44px;height:30px;border-radius:15px;background:#191a22;display:flex;align-items:center;gap:8px;padding:0 14px;font-size:13px;color:rgba(255,255,255,0.85)}
  .nav{position:absolute;left:14px;top:44px;display:flex;gap:6px;color:rgba(255,255,255,0.6)} .nav .i{width:16px;height:16px;margin:7px 6px}
  .wc{position:absolute;right:0;top:0;display:flex} .wc span{width:46px;height:36px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.7)} .wc .i{width:14px;height:14px}
  iframe{border:0;width:1440px;height:809px;transform:scale(${1360 / 1440});transform-origin:0 0;display:block}
</style></head><body>
<div class="bw"><div class="bchrome">
  <div class="tabs"><div class="tab on"><img src="../../assets/brand/descall-icon.png"/>Descall · #genel</div><div class="tab">${L("plus", "sm")}</div></div>
  <div class="wc"><span>${L("minus")}</span><span>${L("square")}</span><span>${L("x")}</span></div>
  <div class="nav">${L("arrow-left")}${L("arrow-right")}${L("rotate-cw")}</div>
  <div class="url">${L("lock", "sm")}<span><b style="font-weight:500">descall.com</b><span style="color:rgba(255,255,255,0.45)">/app</span></span></div>
</div><iframe src="21a-web-inner.html"></iframe></div></body></html>`;

// ── 21b Narrow window ~1024 ──
S["21b-narrow-1024"] = dmScreen({ winOpts: { narrow: true, extraHead: `<style>:root{--side:240px;--rail:64px}</style>` }, railOpts: { narrow: true }, headOpts: { toolsInSearch: true }, sideOpts: { sel: "ayse" } });

export default S;
