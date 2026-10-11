import { win, rail, chead, av, gav, AV, I, L, bgroup, GROUP_GRAD } from "./shared.mjs";
import { dmScreen } from "./screens-a.mjs";
import { serverScreen, serverSide, dock, person, room, qHud } from "./screens-b.mjs";
const S = {};

// ── 09 Server voice channel (ServerVoicePanel) with screen-share stage ──
const vtile = (k, { speaking = false, muted = false, cam = false, w = 0, h = 0, scene = null } = {}) => `
  <div class="tile ${speaking ? "speaking" : ""} vid-${k === "me" ? "self" : "a"}" style="flex:1;min-width:0;height:${h}px;background:radial-gradient(80% 80% at 50% 40%,rgba(255,255,255,0.06),transparent 70%),linear-gradient(160deg,rgba(60,64,96,0.55),rgba(24,26,40,0.75))">
    ${cam ? scene : `<div style="position:relative;z-index:2;border-radius:50%;${speaking ? "box-shadow:0 0 0 3px rgba(48,209,88,0.95),0 0 24px rgba(48,209,88,0.45)" : ""}">${av(k, 64)}</div>`}
    <div class="lbl glass">${speaking ? `<span class="sd"></span>` : ""}${k === "me" ? "Sen" : AV[k].name}${muted ? L("mic-off", "red") : ""}</div>
  </div>`;
const screenStage = `
  <div class="tile" style="position:absolute;left:16px;right:16px;top:84px;height:418px;background:#0b0d14">
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,#1a2a44,#0f1726)"></div>
    <!-- shared screen: a game settings window (illustrative) -->
    <div style="position:absolute;left:6%;right:6%;top:9%;bottom:9%;border-radius:10px;background:#121a2a;box-shadow:0 10px 40px rgba(0,0,0,0.5),inset 0 0 0 1px rgba(255,255,255,0.06);overflow:hidden">
      <div style="height:30px;background:#0c1220;display:flex;align-items:center;gap:6px;padding:0 12px"><i style="width:10px;height:10px;border-radius:5px;background:#ff5f57"></i><i style="width:10px;height:10px;border-radius:5px;background:#febc2e"></i><i style="width:10px;height:10px;border-radius:5px;background:#28c840"></i><span style="font-size:11px;color:rgba(255,255,255,0.5);margin-left:10px">Grafik Ayarları</span></div>
      <div style="display:flex;height:calc(100% - 30px)">
        <div style="width:26%;background:#0f1626;padding:14px 12px;display:flex;flex-direction:column;gap:10px">${["Genel", "Grafik", "Ses", "Kontroller", "Nişangâh"].map((x, i) => `<div style="font-size:11px;padding:6px 8px;border-radius:6px;${i === 1 ? "background:rgba(255,70,85,0.22);color:#fff" : "color:rgba(255,255,255,0.55)"}">${x}</div>`).join("")}</div>
        <div style="flex:1;padding:16px 18px;display:flex;flex-direction:column;gap:12px">${[["Çözünürlük", "1920 × 1080"], ["Ekran modu", "Tam ekran"], ["Kare hızı sınırı", "240 FPS"], ["Doku kalitesi", "Yüksek"], ["Gölgeler", "Kapalı"], ["V-Sync", "Kapalı"]].map(([a, b]) => `<div style="display:flex;justify-content:space-between;font-size:11.5px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06)"><span style="color:rgba(255,255,255,0.6)">${a}</span><span style="color:#fff">${b}</span></div>`).join("")}</div>
      </div>
    </div>
    <div class="lbl glass" style="left:14px;bottom:14px">${I.monitor}Mert K. Ekranı</div>
    <div class="tr glass" style="top:14px;right:14px">${I.volume}<span style="width:72px;height:4px;border-radius:2px;background:linear-gradient(90deg,#fff 70%,rgba(255,255,255,0.25) 70%)"></span></div>
    <div class="tr glass" style="top:14px;right:150px;font-weight:600">${L("maximize-2")}Büyütmek için tıkla</div>
  </div>`;
const voiceDock = `
  <div class="dock glass heavy" style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%)">
    <div class="dslot"><span class="cb g" title="Sessiz">${I.mic}</span><span class="chev" title="Ses cihazları">${I.chevU}</span></div>
    <span class="cb g" title="Sağırlaştır">${I.headphones}</span>
    <span class="glass-chip" style="height:36px;border-radius:18px;padding:0 12px;display:flex;align-items:center;gap:6px;font-size:12px;font-weight:650;color:#7ee2a0;white-space:nowrap" title="Yapay zekâ gürültü engelleme">${L("sparkles", "sm")}AI NS</span>
    <div class="dslot"><span class="cb g" title="Kamera">${I.videoOff}</span><span class="chev" title="Kamera">${I.chevU}</span></div>
    <span class="cb on" title="Ekranı Paylaş">${I.monitor}</span>
    <span class="dsep"></span>
    <span class="btn tint-red" style="height:52px;border-radius:26px;padding:0 20px">${I.phoneOff}Ayrıl</span>
  </div>`;
S["09-server-voice"] = win(`
  <div class="app">
    ${rail("servers", { badges: { chat: 3, groups: 5, servers: 4 } })}
    ${serverSide({ hovChan: null, voiceActive: true })}
    <main class="main" style="background:linear-gradient(180deg,rgba(18,20,30,0.55),rgba(14,15,22,0.7))">
      ${chead({ left: `<div class="peer glass"><span class="hash" style="background:rgba(48,209,88,0.2);color:#7ee2a0">${I.volume}</span><div><div class="nm">Lobi</div><div class="sb dim">Ses kanalı</div></div></div>`,
        buttons: [] }).replace('<div class="bgroup glass "></div>', `<div style="display:flex;gap:8px;align-items:center"><span class="glass" style="height:40px;border-radius:20px;padding:0 14px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:650">${I.users}Seste 4 kişi</span><span class="glass" style="height:40px;border-radius:20px;padding:0 14px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:650;color:#7ee2a0"><span style="width:8px;height:8px;border-radius:4px;background:#30D158;box-shadow:0 0 8px #30D158"></span>Bağlandı</span></div>`)}
      ${screenStage}
      <div style="position:absolute;left:16px;right:16px;top:${84 + 418 + 12}px;display:flex;gap:12px">
        ${vtile("ayse", { speaking: true, h: 176 })}
        ${vtile("mert", { muted: true, h: 176, cam: true, scene: room("#2b2f4a", "#151827") + person("#c99a7a", "#24304d", "#231a14") })}
        ${vtile("elif", { h: 176 })}
        ${vtile("me", { h: 176 })}
      </div>
      ${voiceDock}
    </main>
  </div>`);

// ── 09b Group call (CallOverlay, group grid, camera off tiles) ──
const gtile = (k, o = {}) => `
  <div class="tile ${o.speaking ? "speaking" : ""}" style="background:radial-gradient(70% 70% at 50% 40%,${o.tint || "rgba(108,134,255,0.18)"},transparent 70%),linear-gradient(160deg,rgba(56,60,92,0.6),rgba(22,24,38,0.8))">
    ${o.cam ? o.cam : `<div style="position:relative;z-index:2;border-radius:50%;${o.speaking ? "box-shadow:0 0 0 3px rgba(48,209,88,0.95),0 0 28px rgba(48,209,88,0.5)" : ""}">${av(k, 96)}</div>`}
    <div class="lbl glass">${o.speaking ? `<span class="sd"></span>` : ""}${k === "me" ? "Sen" : AV[k].name}${o.muted ? L("mic-off", "red") : ""}${o.deaf ? L("headphone-off", "red") : ""}</div>
    ${o.hand ? `<div class="tr glass" style="color:var(--gold);right:auto;left:12px" title="El kaldırdı">${I.hand}</div>` : ""}
    ${o.camOff ? `<div class="tr glass" title="Kamera kapalı">${I.videoOff}</div>` : ""}
  </div>`;
S["09b-group-call"] = win(`
  <div class="call-bg" style="top:40px"></div>
  <div style="position:absolute;top:56px;left:24px;right:24px;height:52px;z-index:60;display:flex;align-items:center;gap:10px">
    <div class="peer glass">${gav("AE", GROUP_GRAD, 40)}<div><div class="nm">Akşam Ekibi</div><div class="sb dim" style="font-variant-numeric:tabular-nums">18:36 · Görüntülü arama</div></div></div>
    <div style="flex:1"></div>
    ${qHud.replaceAll("Mükemmel", "İyi").replace('<i style="height:13px"></i>', '<i style="height:13px;opacity:0.3"></i>')}
    ${bgroup([["users", { t: "Katılımcıları göster", on: false }], ["chat", { t: "Sohbet" }], ["minus", { t: "Küçült" }]]).replace('class="bgroup glass "', 'class="bgroup glass" style="height:44px;border-radius:22px"')}
  </div>
  <div style="position:absolute;left:24px;right:24px;top:124px;bottom:116px;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:12px;z-index:10">
    ${gtile("ayse", { speaking: true, cam: room("#4a3566", "#1f2a44") + person("#d8a487", "#3b2a5e", "#3a2418") })}
    ${gtile("mert", { muted: true, tint: "rgba(155,133,255,0.22)", camOff: true })}
    ${gtile("elif", { hand: true, tint: "rgba(255,170,90,0.18)", camOff: true })}
    ${gtile("burak", { deaf: true, muted: true, tint: "rgba(90,200,250,0.16)", camOff: true })}
    ${gtile("selin", { tint: "rgba(48,209,88,0.14)", camOff: true })}
    ${gtile("me", { cam: room("#1f2a44", "#16202f", "rgba(140,180,255,0.45)") + person("#c58f6c", "#1f3357", "#1d1612") })}
  </div>
  ${dock()}`, { bg: `<div class="ambient"></div>` });

// ── 10 Incoming call card (IncomingCallCard, glass variant, top-centre) ──
const incoming = ({ k = "ayse", video = true, group = false } = {}) => `
  <div class="glass heavy" style="position:absolute;z-index:300;top:${40 + 16}px;left:50%;transform:translateX(-50%);width:420px;border-radius:30px;padding:16px 16px 16px 18px;display:flex;align-items:center;gap:16px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.22),0 24px 60px rgba(0,0,0,0.55),0 0 0 0.5px rgba(255,255,255,0.18)">
    <div style="position:relative;width:72px;height:72px;flex-shrink:0">
      ${[1.5, 1.28, 1.1].map((s, i) => `<span style="position:absolute;inset:0;border-radius:50%;transform:scale(${s});border:1.5px solid rgba(${video ? "88,122,246" : "48,209,88"},${0.18 + i * 0.14})"></span>`).join("")}
      ${group ? gav("AE", GROUP_GRAD, 72, "") .replace('class="av ', 'class="av " style="border-radius:50%" data-x="') : av(k, 72)}
      <span style="position:absolute;right:-2px;bottom:-2px;width:26px;height:26px;border-radius:13px;display:flex;align-items:center;justify-content:center;background:${video ? "var(--brand)" : "#30D158"};box-shadow:0 0 0 2.5px #2a2c3e,0 4px 10px rgba(0,0,0,0.4);color:#fff">${video ? L("video", "sm") : L("phone", "sm")}</span>
    </div>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:650;color:var(--brand-hi);letter-spacing:0.01em;display:flex;align-items:center;gap:6px">${L("phone", "sm")}${video ? "Gelen görüntülü arama" : "Gelen sesli arama"}</div>
      <div style="font-size:17px;font-weight:700;letter-spacing:-0.02em;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${group ? "Akşam Ekibi" : AV[k].name} arıyor</div>
      <div style="font-size:12.5px;color:var(--t3);margin-top:2px">${group ? "Grup araması" : video ? "Görüntülü arama" : "Sesli arama"}</div>
    </div>
    <div style="display:flex;gap:10px">
      <span title="Reddet" style="width:52px;height:52px;border-radius:26px;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(180deg,#ff6259,#e5352b);box-shadow:inset 0 1px 0 rgba(255,255,255,0.35),0 8px 20px rgba(255,69,58,0.45)">${L("phone-off")}</span>
      <span title="Kabul Et" style="width:52px;height:52px;border-radius:26px;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(180deg,#46e06e,#25b44a);box-shadow:inset 0 1px 0 rgba(255,255,255,0.35),0 8px 20px rgba(48,209,88,0.45)">${L("phone")}</span>
    </div>
  </div>`;
S["10-incoming-call"] = dmScreen({ sideOpts: { sel: "mert" }, overlay: incoming({ k: "ayse", video: true }) });
S["10b-incoming-group"] = serverScreen({ overlay: incoming({ group: true, video: false }) });

export default S;
