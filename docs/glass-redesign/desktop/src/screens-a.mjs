import { win, rail, railTip, sideHeader, dmRow, dmList, chead, peerDm, DM_BTNS, composer, replyStrip, editStrip, group, tick, reacts, wave, typing, av, gav, AV, I, L, bgroup, GROUP_GRAD, GROUP2_GRAD, GROUP3_GRAD, GROUP4_GRAD, groupRow } from "./shared.mjs";
const S = {};

const googleMark = `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"/></svg>`;

// ── 01 Login / 01b Register (AuthView; desktop = Google only, no Apple) ──
function auth(mode) {
  const reg = mode === "register";
  return win(`
  <div style="position:absolute;inset:0;z-index:1;background:radial-gradient(28% 34% at 50% 22%, rgba(88,122,246,0.40), transparent 70%)"></div>
  <div style="position:absolute;inset:40px 0 0;z-index:10;display:flex;flex-direction:column;align-items:center;padding-top:${reg ? 20 : 72}px">
    <img src="../../assets/brand/descall-icon.png" style="width:${reg ? 56 : 80}px;height:${reg ? 56 : 80}px;filter:drop-shadow(0 14px 30px rgba(88,122,246,0.45))" alt="Descall"/>
    <div style="font-size:${reg ? 28 : 32}px;font-weight:700;letter-spacing:-0.03em;margin-top:${reg ? 8 : 14}px">Descall</div>
    <p style="font-size:15px;color:var(--t2);margin-top:4px">Arkadaşlarınla ses, görüntü ve mesajlaşmayla bağlan</p>
    <div class="glass heavy" style="width:432px;margin-top:${reg ? 18 : 28}px;border-radius:32px;padding:20px 20px 22px">
      <div class="seg glass-chip" style="margin-bottom:16px;height:42px;border-radius:21px">
        <div class="${reg ? "" : "lens"}" style="border-radius:18px">Giriş</div><div class="${reg ? "lens" : ""}" style="border-radius:18px">Kayıt ol</div></div>
      <div class="btn w fill" style="height:46px;border-radius:23px;font-size:15px">${googleMark}Google ile devam et</div>
      <div style="display:flex;align-items:center;gap:12px;margin:14px 4px;color:var(--t3);font-size:12.5px"><span style="flex:1;height:0.5px;background:rgba(255,255,255,0.16)"></span>veya<span style="flex:1;height:0.5px;background:rgba(255,255,255,0.16)"></span></div>
      <div class="field-in ${reg ? "" : "focus"}">${I.user}<span class="v">demir</span>${reg ? "" : `<span class="caret" style="display:inline-block;width:1.5px;height:17px;background:var(--brand-hi);margin-left:-8px"></span>`}</div>
      <div class="field-in" style="margin-top:10px">${I.lock}<span class="v" style="letter-spacing:0.14em">••••••••••</span><span class="end" title="Şifreyi göster">${I.eye}</span></div>
      ${reg ? `
      <div class="flabel" style="margin:14px 2px 8px">Doğum tarihi</div>
      <div style="display:grid;grid-template-columns:1fr 1.4fr 1.1fr;gap:8px">
        <div class="field-in"><span class="v">14</span><span class="end">${I.chevD}</span></div>
        <div class="field-in"><span class="v">Mart</span><span class="end">${I.chevD}</span></div>
        <div class="field-in"><span class="v">2004</span><span class="end">${I.chevD}</span></div>
      </div>
      <div class="field-in" style="margin-top:10px">${I.mail}<span>E-posta (opsiyonel)</span></div>
      <p class="hint" style="margin:8px 4px 0">E-posta eklemek hesap kurtarma, giriş kodları ve iki adımlı doğrulamayı açar. Dilersen daha sonra Ayarlar'dan da ekleyebilirsin.</p>
      <div style="display:flex;gap:10px;align-items:flex-start;margin:14px 4px 0">
        <span style="width:20px;height:20px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff" class="tint-brand">${L("check")}</span>
        <p style="font-size:12.5px;line-height:18px;color:var(--t2)">Okudum ve kabul ediyorum: <b style="color:var(--brand-hi);font-weight:600">Hizmet Şartları</b> ve <b style="color:var(--brand-hi);font-weight:600">Gizlilik Politikası</b>.<br/><span style="color:var(--t3)">Descall'da uygunsuz içeriğe ve taciz eden kullanıcılara sıfır tolerans vardır.</span></p>
      </div>
      <div class="btn w tint-brand" style="margin-top:16px;height:48px;border-radius:24px;font-size:16px">Hesap Oluştur</div>` : `
      <div style="display:flex;justify-content:flex-end;margin:10px 4px 0"><span style="font-size:13.5px;color:var(--brand-hi);font-weight:600">Şifrenizi mi unuttunuz?</span></div>
      <div class="btn w tint-brand" style="margin-top:14px;height:48px;border-radius:24px;font-size:16px">Giriş</div>`}
    </div>
    <p style="font-size:12.5px;color:var(--t3);margin-top:${reg ? 14 : 20}px">Devam ederek Hizmet Şartlarımızı kabul etmiş olursunuz</p>
    <p style="font-size:12.5px;color:var(--t2);margin-top:6px;font-weight:600">Hizmet Şartları <span style="color:var(--t4)">·</span> Gizlilik Politikası <span style="color:var(--t4)">·</span> <span style="color:var(--t3);font-weight:500">© 2026 Demir Sarp Kurtlar</span></p>
  </div>`);
}
S["01-login"] = auth("login");
S["01b-register"] = auth("register");

// ── Shared DM conversation (Ayşe) ──
const dmMsgs = ({ hoverPinned = false, editing = false } = {}) => `
  <div class="daysep">Dün</div>
  ${group("ayse", "Dün 20:44", [{ html: `<div class="rq"><b>Demir</b><span>Olur, 9 gibi girerim</span></div>Süper! Akşam Ekibi’ne de yazdım, kanal hazır` }], { status: "online" })}
  ${group("me", "Dün 20:47", [{ html: `<div class="callsum"><span class="ci">${I.phoneOut}</span><div><b>Sesli arama</b><em>12 dk 40 sn</em></div></div>` }], { own: true, status: "online" })}
  <div class="daysep">Bugün</div>
  ${group("ayse", "20:52", [{ html: `<div class="pinb">${I.pin}Sabitlendi</div>Cuma 21:00 turnuva — kadroyu unutma!`, id: "pinned" }], { status: "online", extraAfter: reacts([["🔥", 2, true], ["👍", 1]]), id: "g-pinned" })}
  ${group("me", "20:55", [{ html: `<div class="voice"><span class="pl">${I.play2}</span>${wave()}<span class="d">0:14</span></div>${tick()}` },
    { html: editing ? `Ekran ayarlarını attım, 1080p 60 seç${tick()}` : `Ekran ayarlarını attım, 1080p 60 seç${tick()}`, cls: editing ? "hl" : "", id: "own-edit" }], { own: true, status: "online" })}
  <div class="unreadsep">Yeni mesajlar</div>
  ${group("ayse", "21:14", ["Lobi kanalına geçiyorum, ses ayarlarını bir kontrol et <span class=\"edited\">(düzenlendi)</span>", "Tamam, 9’da Lobi’de 👋"], { status: "online" })}
  ${typing("ayse", "Ayşe Yılmaz yazıyor")}`;

function dmScreen({ sideOpts = {}, msgOpts = {}, comp = {}, overlay = "", headActive = null, winOpts = {}, railOpts = {}, headOpts = {} } = {}) {
  return win(`
  <div class="app">
    ${rail("chat", railOpts)}
    <aside class="side glass panel">
      ${sideHeader("Sohbetler", headOpts)}
      <div class="side-body">
        <div class="sect">Sohbetler<span class="sp"></span>${I.chevD}</div>
        ${dmList(sideOpts)}
      </div>
    </aside>
    <main class="main">
      <div class="msgs" style="${comp.strip ? "bottom:140px" : ""}">${dmMsgs(msgOpts)}</div>
      ${chead({ left: peerDm("ayse"), buttons: DM_BTNS(1, headActive) })}
      ${composer({ text: "Geliyorum, 2 dk", ...comp })}
    </main>
  </div>${overlay}`, winOpts);
}
S["02-dm"] = dmScreen({ sideOpts: { sel: "ayse", hov: "zeynep" } });

// ── 03a hover toolbar + "Tepki ver" picker + reply strip ──
const hoverBar = `
  <div class="glass heavy" style="position:absolute;z-index:80;left:${16 + 72 + 8 + 296 + 8 + 300}px;top:0;height:44px;border-radius:22px;display:flex;align-items:center;gap:2px;padding:0 6px" id="hb">
    ${["👍", "❤️", "😂", "😮", "😢"].map((e) => `<span style="width:34px;height:34px;border-radius:17px;display:flex;align-items:center;justify-content:center;font-size:18px">${e}</span>`).join("")}
    <span style="width:1px;height:22px;background:rgba(255,255,255,0.14);margin:0 4px"></span>
    ${[["smile", "Daha fazla tepki", true], ["reply", "Yanıtla"], ["pinOff", "Sabitlemeyi kaldır"], ["flag", "Şikayet et"]].map(([ic, t, on]) => `<span title="${t}" style="width:34px;height:34px;border-radius:17px;display:flex;align-items:center;justify-content:center;color:${on ? "var(--brand-hi)" : "var(--t1)"};${on ? "background:rgba(88,122,246,0.22)" : ""}">${I[ic]}</span>`).join("")}
  </div>
  <div class="glass heavy" style="position:absolute;z-index:81;width:236px;border-radius:20px;padding:10px 10px 12px" id="pk">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px 8px;font-size:12px;font-weight:650;color:var(--t3);letter-spacing:0.04em;text-transform:uppercase"><span>Tepki ver</span><span class="xbtn" style="width:24px;height:24px">${I.x}</span></div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">${["👍", "❤️", "😂", "😮", "😢", "🎉", "🔥", "👏", "🤔", "👎"].map((e, i) => `<span style="height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;${i === 6 ? "background:rgba(255,255,255,0.12)" : ""}">${e}</span>`).join("")}</div>
  </div>`;
// position overlays relative to the pinned bubble at render time
const placeScript = (pairs) => `<script>
window.addEventListener('load',()=>{ ${pairs} });
</script>`;
S["03a-hover-reply"] = dmScreen({
  sideOpts: { sel: "ayse" }, msgOpts: { hoverPinned: true },
  comp: { text: "", placeholder: "Mesaj…", strip: replyStrip("Ayşe Yılmaz", "Cuma 21:00 turnuva — kadroyu unutma!") },
  overlay: hoverBar + placeScript(`
    const b=document.getElementById('g-pinned').getBoundingClientRect();
    const hb=document.getElementById('hb'); hb.style.left=(b.right-hb.offsetWidth-16)+'px'; hb.style.top=(b.top-20)+'px';
    const pk=document.getElementById('pk'); const h=hb.getBoundingClientRect(); pk.style.left=(h.right-236)+'px'; pk.style.top=(h.bottom+8)+'px';`),
}).replace(`id="g-pinned">`, `id="g-pinned" style="background:rgba(255,255,255,0.04);margin-left:-14px;margin-right:-14px;padding:6px 14px 8px;border-radius:16px">`);

// ── 03b DM right-click menu + own-message edit state ──
const dmMenu = `
  <div class="menu glass heavy" style="left:${8 + 72 + 8 + 160}px;top:338px;width:228px" id="dmm">
    <div class="mi hov">${I.pin}Sabitle</div>
    <div class="mi">${I.bellOff}Sessiz</div>
    <div class="mi">${I.mail}Okunmadı işaretle</div>
    <div class="msep"></div>
    <div class="mi">${I.circleSlash}Engelle</div>
    <div class="mi">${I.flag}Şikayet et</div>
    <div class="mi danger">${I.x}Kapat</div>
  </div>
  <div style="position:absolute;z-index:252;left:${8 + 72 + 8 + 154}px;top:330px">${L("mouse-pointer-2")}</div>`;
S["03b-context-edit"] = dmScreen({
  sideOpts: { sel: "ayse", hov: "zeynep" }, msgOpts: { editing: true },
  comp: { text: "Ekran ayarlarını attım, 1080p 60 seç — bit hızı 8 Mbps", editing: true, strip: editStrip("Ekran ayarlarını attım, 1080p 60 seç") },
  overlay: dmMenu,
}).replace('<div style="position:absolute;z-index:252', '<div style="position:absolute;z-index:252;color:#fff;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))');

// ── 04 attach / emoji / GIF ──
const attachMenu = `
  <div class="menu glass heavy" style="left:${8 + 72 + 8 + 296 + 8 + 20}px;bottom:${8 + 16 + 52 + 10}px;width:240px;padding:8px">
    ${[["image", "Görsel Yükle", "#587AF6"], ["file", "Dosya Yükle", "#30b0c7"], ["gift", "GIF Gönder", "#e0508f"]].map(([ic, l, c], i) => `
      <div class="mi ${i === 0 ? "hov" : ""}" style="height:48px;gap:12px"><span class="gi" style="background:${c}">${I[ic]}</span><span style="font-size:14px;font-weight:550">${l}</span></div>`).join("")}
  </div>`;
S["04a-attach"] = dmScreen({ comp: { text: "", placeholder: "Mesaj…", open: "attach" }, overlay: attachMenu });

const EMO = {
  Suratlar: "😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😚😙😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬🤥😌😔😪🤤😴😷",
  İşaretler: "👋🤚🖐️✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆👇☝️👍👎✊👊🤛🤜👏🙌",
  Kalpler: "❤️🧡💛💚💙💜🖤🤍🤎❣️💕💞💓💗💖💘💝💟",
};
const seg = (s) => [...new Intl.Segmenter("tr", { granularity: "grapheme" }).segment(s)].map((x) => x.segment);
const emojiPicker = `
  <div class="glass heavy" style="position:absolute;z-index:250;right:${8 + 20 + 52}px;bottom:${8 + 16 + 52 + 10}px;width:372px;border-radius:24px;padding:14px 14px 12px;overflow:hidden">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 2px 10px"><span style="font-size:15px;font-weight:700;letter-spacing:-0.015em">Emojiler</span><span class="xbtn" style="width:28px;height:28px">${I.x}</span></div>
    ${Object.entries(EMO).map(([n, e]) => `<div class="mhead" style="padding:8px 2px 6px">${n}</div>
      <div style="display:grid;grid-template-columns:repeat(9,1fr);gap:2px">${seg(e).slice(0, n === "Suratlar" ? 36 : n === "İşaretler" ? 18 : 9).map((x, i) => `<span style="height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:21px;${n === "Suratlar" && i === 7 ? "background:rgba(255,255,255,0.12)" : ""}">${x}</span>`).join("")}</div>`).join("")}
  </div>`;
S["04b-emoji"] = dmScreen({ comp: { text: "Geliyorum, 2 dk 😂", open: "emoji" }, overlay: emojiPicker });

const gifTile = (g, h, label = "") => `<div style="height:${h}px;border-radius:12px;background:${g};position:relative;overflow:hidden;box-shadow:inset 0 0 0 0.5px rgba(255,255,255,0.1)">${label ? `<span style="position:absolute;left:8px;bottom:8px;font-size:12px;font-weight:700;text-shadow:0 1px 4px rgba(0,0,0,.6)">${label}</span>` : ""}</div>`;
const G = ["linear-gradient(135deg,#ff9a8b,#ff6a88 55%,#ff99ac)", "linear-gradient(135deg,#43cea2,#185a9d)", "linear-gradient(135deg,#f7971e,#ffd200)", "linear-gradient(135deg,#8e2de2,#4a00e0)",
  "linear-gradient(135deg,#00c6ff,#0072ff)", "linear-gradient(135deg,#f953c6,#b91d73)", "linear-gradient(135deg,#56ab2f,#a8e063)", "linear-gradient(135deg,#ee0979,#ff6a00)", "linear-gradient(135deg,#2c3e50,#4ca1af)"];
const gifPicker = `
  <div class="scrim" style="background:rgba(5,6,10,0.28)"></div>
  <div class="glass heavy" style="position:absolute;z-index:250;left:${8 + 72 + 8 + 296 + 8 + 20}px;bottom:${8 + 16 + 52 + 10}px;width:520px;height:560px;border-radius:26px;padding:16px;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><span style="flex:1;font-size:17px;font-weight:700;letter-spacing:-0.02em">GIF seç</span><span class="xbtn">${I.x}</span></div>
    <div class="field-in focus" style="height:40px">${I.search}<span class="v">gg</span><span class="end" title="Aramayı temizle">${L("circle-x")}</span></div>
    <div class="mhead" style="padding:14px 2px 8px">Trendler</div>
    <div style="flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;overflow:hidden">
      <div style="display:flex;flex-direction:column;gap:8px">${gifTile(G[0], 120, "gg wp")}${gifTile(G[3], 160)}${gifTile(G[6], 90)}</div>
      <div style="display:flex;flex-direction:column;gap:8px">${gifTile(G[1], 160, "GG")}${gifTile(G[4], 110)}${gifTile(G[7], 120)}</div>
      <div style="display:flex;flex-direction:column;gap:8px">${gifTile(G[2], 100)}${gifTile(G[5], 150, "ez clap")}${gifTile(G[8], 130)}</div>
    </div>
    <div style="text-align:center;font-size:11px;color:var(--t3);padding-top:10px;font-weight:600;letter-spacing:0.02em">GIPHY tarafından desteklenir</div>
  </div>`;
S["04c-gif"] = dmScreen({ comp: { text: "", placeholder: "Mesaj…" }, overlay: gifPicker });

export { dmScreen };
export default S;
