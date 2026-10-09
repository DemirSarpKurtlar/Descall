// Stage 2 report: node report-shell.mjs 2.9.154
import fs from "node:fs";
const V = process.argv[2] || "2.9.154";
const DIR = process.env.COMPARE_DIR || new URL("./out", import.meta.url).pathname;
const r = JSON.parse(fs.readFileSync(`${DIR}/shell/results-${V}.json`, "utf8"));
const zd = fs.existsSync(`${DIR}/zero-diff-${V}/zero-diff.json`) ? JSON.parse(fs.readFileSync(`${DIR}/zero-diff-${V}/zero-diff.json`, "utf8")) : [];
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const NAMES = { "02-chats": "02 Sohbetler", "02b-groups": "02b Gruplar", "09-friends": "09 Arkadaşlar", "11-servers": "11 Sunucular", "19-calls": "19 Aramalar", "20-activity": "20 Aktivite", "18-status": "18 Durum seçici" };
let rows = "", sections = "";
for (const [id, v] of Object.entries(r)) {
  const bad = v.geo.filter((g) => !g.ok);
  rows += `<tr><td>${NAMES[id] || id}</td><td class="${bad.length ? "warn" : "ok"}">${v.geoOk}/${v.geoTotal}</td><td>${v.px.over8}%</td><td>${v.px.over32}%</td><td>${v.errors.length ? esc(v.errors[0]) : "—"}</td></tr>`;
  const texts = v.geo.filter((g) => g.textM != null && g.textM !== g.textA).map((g) => `<li>${g.k}: mockup “${esc(g.textM)}” · app “${esc(g.textA)}”</li>`).join("");
  sections += `<section><h2>${NAMES[id] || id}</h2>
  <p>Geometri ${v.geoOk}/${v.geoTotal} öğe ±1 pt içinde. Krom-only piksel farkı: ${v.px.over8}% (Δ&gt;8), ${v.px.over32}% (Δ&gt;32).</p>
  ${bad.length ? `<p>±1 pt dışı: ${bad.map((g) => `<code>${g.k}</code> Δ${g.d ?? "?"}pt ${g.note || ""}`).join(", ")}</p>` : ""}
  ${texts ? `<details><summary>Metin farkları</summary><ul>${texts}</ul></details>` : ""}
  <p class="cap">Mockup · Uygulama (tam ekran, gerçek liste verisiyle)</p><img src="shell/${id}-side-by-side.png">
  <p class="cap">Mockup · Uygulama · fark haritası (yalnız kabuk: içerik gizli)</p><img src="shell/${id}-chrome-side-by-side.png">
  </section>`;
}
const zdRows = zd.map((z) => `<tr><td>${z.name}</td><td class="${z.diffPx === 0 ? "ok" : "warn"}">${z.diffPx}</td><td class="${z.domSame ? "ok" : "warn"}">${z.domSame ? "aynı" : "FARKLI"}</td><td>${z.glass ? "evet" : "hayır"}</td></tr>`).join("");
const html = `<!doctype html><meta charset="utf-8"><title>Descall ${V} — Liquid Glass Aşama 2 karşılaştırma</title>
<style>body{font:14px/1.5 -apple-system,Inter,sans-serif;background:#111;color:#eee;max-width:1500px;margin:24px auto;padding:0 16px}img{max-width:100%;border-radius:8px;margin:6px 0 18px}table{border-collapse:collapse;margin:12px 0}td,th{border:1px solid #333;padding:4px 10px;text-align:left}.ok{color:#5ee08a}.warn{color:#ffc15a}code{background:#222;padding:1px 4px;border-radius:4px}.cap{color:#999;margin:4px 0}section{border-top:1px solid #333;margin-top:28px}</style>
<h1>Descall ${V} — Liquid Glass Aşama 2 (navigasyon kabuğu)</h1>
<p>Çekim: shotkit sahte iOS köprüsü, 440×956 @3x, güvenli alan 62/34, Chrome; mockup = docs/glass-redesign/final/src/screens/*.html aynı motorla. Sistem durum çubuğu ve home indicator diff dışında (cihaz çizer).</p>
<h2>Özet</h2>
<table><tr><th>Ekran</th><th>Geometri (±1pt)</th><th>Piksel Δ&gt;8</th><th>Piksel Δ&gt;32</th><th>JS hata</th></tr>${rows}</table>
<h3>Bilinen, kabul edilen farklar</h3><ul>
<li><b>Liste satırları / kartlar</b> (Sohbetler satırları, Arkadaşlar kartları, Aramalar çipleri, Aktivite kartı, sunucu kanal kartı) Aşama 3–6'nın işi; bu raporda kabuk (bar, araç çubuğu, başlık, arama, durum menüsü) ölçülür, piksel diff'i içerik gizlenerek alınır.</li>
<li><b>Duyurular rozeti (2)</b>: API'de okunmamış duyuru sayısı yok; rozet yalnızca gerçek sayı olduğunda çizilir (mockup'taki "2" örnek veri).</li>
<li><b>Kendi avatarın</b>: mockup "D" degrade, uygulama hesabın avatarı/rengi (diff'te maskelenir).</li>
<li><b>Yazı glifleri</b>: Chrome'da SF Pro yok → her iki taraf Inter'e düşer ama uygulama kendi Inter sürümünü yükler (küçük glif genişliği farkı, ör. sekme etiketi "Arkadaşlar" 1,3 pt). Cihazda SF Pro.</li>
<li><b>11 Sunucular</b>: mockup açık sunucunun kanal listesini gösteriyor (Aşama 5); uygulamada aynı araç çubuğu (avatar · "Sunucular" · +) sunucu listesinin üstünde. + menüsü: Sunucu oluştur, Sunucuya Katıl, Yeni klasör, Sunucuları yeniden sırala.</li>
<li><b>19 / 20</b>: arama alanı mockup'taki gibi kapalı; büyüteç dokununca açılır.</li>
</ul>
<h2>Masaüstü / web / Android / iPad / glass kapalı iPhone: fark = 0</h2>
<table><tr><th>Senaryo</th><th>Farklı piksel</th><th>DOM</th><th>glass-ui</th></tr>${zdRows}</table>
${sections}`;
fs.writeFileSync(`${DIR}/report-${V}.html`, html);
console.log("wrote", `${DIR}/report-${V}.html`);
