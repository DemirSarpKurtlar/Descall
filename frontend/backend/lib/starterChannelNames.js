/**
 * Channel names for the simple starter layout (POST /servers with templateId "default").
 * The names are written into the database in the creator's language (starterLocale from the
 * app, backend/i18n/<locale>.js starter.*; English for a language without a catalog).
 * Without a known starterLocale the legacy English names stay unchanged for older clients.
 */
const { bt, pickLang } = require("./i18n");
const { normalizeLocale } = require("./locales");

const LEGACY = { textCategory: "Text Channels", text: "general", voiceCategory: "Voice Channels", voice: "General" };

function starterChannelNames(locale) {
  // No (or an unknown) starterLocale: the legacy names, as before.
  if (!normalizeLocale(locale)) return { ...LEGACY };
  const lang = pickLang([locale], "en");
  return {
    textCategory: bt(lang, "starter.textCategory"),
    text: bt(lang, "starter.text"),
    voiceCategory: bt(lang, "starter.voiceCategory"),
    voice: bt(lang, "starter.voice"),
  };
}

module.exports = { starterChannelNames };
