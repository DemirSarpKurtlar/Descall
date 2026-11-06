import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localizeListPreview } from "./listPreview.js";

const tr = (key) =>
  ({
    "📞 Call": "📞 Arama",
    "📷 Photo": "📷 Fotoğraf",
    "🎤 Voice message": "🎤 Sesli mesaj",
    "📎 Attachment": "📎 Ek dosya",
  })[key] || key;

assert.equal(localizeListPreview("📞 Call", tr), "📞 Arama");
assert.equal(localizeListPreview("📎 Attachment", tr), "📎 Ek dosya");
assert.equal(localizeListPreview("📷 Photo", tr), "📷 Fotoğraf");
assert.equal(localizeListPreview("🎤 Voice message", tr), "🎤 Sesli mesaj");
assert.equal(localizeListPreview("ada: 📞 Call", tr), "ada: 📞 Arama");
assert.equal(localizeListPreview("ada: 📎 Attachment", tr), "ada: 📎 Ek dosya");
assert.equal(localizeListPreview("📞 Arama", tr), "📞 Arama");
assert.equal(localizeListPreview("selam", tr), "selam");
assert.equal(localizeListPreview("Call me later", tr), "Call me later");
assert.equal(localizeListPreview("Attachment theory", tr), "Attachment theory");
assert.equal(localizeListPreview("", tr), "");
assert.equal(localizeListPreview(null, tr), "");

const en = (key) => key;
assert.equal(localizeListPreview("📞 Call", en), "📞 Call");

// UI audit #96: previews show words, not markdown syntax.
assert.equal(
  localizeListPreview("**Önemli:** yarın sunucu bakımda, `22:00` itibarıyla 1 saat kapalı.", tr),
  "Önemli: yarın sunucu bakımda, 22:00 itibarıyla 1 saat kapalı.",
);
assert.equal(localizeListPreview("ada: **hey** _sen_ ~~yok~~ ||sır||", tr), "ada: hey sen yok sır");
assert.equal(localizeListPreview("> alıntı\nikinci satır", tr), "alıntı ikinci satır");
assert.equal(localizeListPreview("2*3*4 = 24", tr), "2*3*4 = 24");
assert.equal(localizeListPreview("snake_case_name", tr), "snake_case_name");

const sidebar = readFileSync(new URL("../components/layout/ServerSidebar.jsx", import.meta.url), "utf8");
assert.match(sidebar, /localizeListPreview\(dm\.lastMessage/);
assert.match(sidebar, /localizeListPreview\(preview, t\)/);

console.log("listPreview.selftest ok");
