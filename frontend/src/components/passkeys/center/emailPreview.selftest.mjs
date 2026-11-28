/**
 * Run: node frontend/src/components/passkeys/center/emailPreview.selftest.mjs
 * The "Guvenlik e-postasi" preview (CenterCards EmailCard) in every locale: the body takes the
 * whole "from <place>" phrase as {from} (Turkish puts a case ending on the place), never an
 * empty date. It once read "\"Ev bilgisayari\" tarihinde bilinmeyen bir konum konumundan
 * eklendi." (no date, the place word twice).
 */
import assert from "node:assert/strict";
import { formatMessage, messageArguments } from "../../../i18n/message.js";
import { PASSKEY_TR } from "../../../i18n/locales/passkey.tr.js";
import { PASSKEY_EN } from "../../../i18n/locales/passkey.en.js";
import { PASSKEY_DE } from "../../../i18n/locales/passkey.de.js";
import { PASSKEY_ES } from "../../../i18n/locales/passkey.es.js";
import { PASSKEY_FR } from "../../../i18n/locales/passkey.fr.js";
import { PASSKEY_PT_BR } from "../../../i18n/locales/passkey.pt-BR.js";
import { PASSKEY_RU } from "../../../i18n/locales/passkey.ru.js";
import { fullDate, timeText } from "./centerFormat.js";

const LOCALES = { tr: PASSKEY_TR, en: PASSKEY_EN, de: PASSKEY_DE, es: PASSKEY_ES, fr: PASSKEY_FR, "pt-BR": PASSKEY_PT_BR, ru: PASSKEY_RU };
const at = "2026-11-28T14:58:00Z";

for (const [loc, cat] of Object.entries(LOCALES)) {
  const e = cat.center.email;
  assert.deepEqual([...messageArguments(e.body)].sort(), ["from", "name", "provider", "when"], `${loc}: body arguments`);
  assert.deepEqual([...messageArguments(e.fromPlace)], ["place"], `${loc}: fromPlace has {place}`);
  assert.equal(messageArguments(e.fromSomewhere).size, 0, `${loc}: fromSomewhere is a whole phrase`);
  assert.equal(e.somewhere, undefined, `${loc}: the bare place word is gone`);
  const when = `${fullDate(at, loc)} ${timeText(at, loc)}`;
  for (const from of [formatMessage(e.fromPlace, { place: "Ankara" }, loc), e.fromSomewhere]) {
    const out = formatMessage(e.body, { name: "Ev", provider: "", when, from }, loc);
    assert.ok(!/[{}]/.test(out), `${loc}: every placeholder filled: ${out}`);
    assert.ok(out.includes(when), `${loc}: the date is in the text`);
    assert.ok(out.includes(from), `${loc}: the place phrase is in the text`);
  }
}

// The Turkish line from the report, fixed.
{
  const e = PASSKEY_TR.center.email;
  const when = "28 Kas 2026 17:58";
  assert.equal(
    formatMessage(e.body, { name: "Ev bilgisayarı", provider: "", when, from: e.fromSomewhere }, "tr"),
    "\"Ev bilgisayarı\" adlı passkey 28 Kas 2026 17:58 tarihinde bilinmeyen bir konumdan eklendi. Sen değilsen hemen kaldır ve şifreni değiştir.",
  );
  const known = formatMessage(e.body, { name: "iPhone", provider: " (iCloud Anahtar Zinciri)", when, from: formatMessage(e.fromPlace, { place: "İstanbul" }, "tr") }, "tr");
  assert.equal(known, "\"iPhone\" adlı passkey (iCloud Anahtar Zinciri) 28 Kas 2026 17:58 tarihinde İstanbul konumundan eklendi. Sen değilsen hemen kaldır ve şifreni değiştir.");
  assert.ok(!/konum konumundan/.test(known));
}

// The component: the sample card is dated (no "" before "tarihinde"), the place goes through {from}.
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./CenterCards.jsx", import.meta.url), "utf8");
  assert.match(src, /passkey\?\.createdAt \|\| new Date\(\)\.toISOString\(\)/, "a card without a passkey is dated now");
  assert.match(src, /"passkey\.center\.email\.body", \{ name, provider: .*, when, from \}\)/, "the body gets {from}");
  assert.doesNotMatch(src, /email\.somewhere/);
}

console.log("passkey e-mail preview selftest OK");
