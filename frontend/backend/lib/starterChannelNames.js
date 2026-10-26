/**
 * Channel names for the simple starter layout (POST /servers with templateId "default").
 * Without a starterLocale the legacy English names stay unchanged for older clients.
 */
const LEGACY = { textCategory: "Text Channels", text: "general", voiceCategory: "Voice Channels", voice: "General" };
const BY_LOCALE = {
  tr: { textCategory: "Metin kanalları", text: "genel", voiceCategory: "Ses kanalları", voice: "Lobi" },
  en: { textCategory: "Text Channels", text: "general", voiceCategory: "Voice Channels", voice: "Lobby" },
};

function starterChannelNames(locale) {
  const key = String(locale || "").trim().toLowerCase().slice(0, 2);
  return BY_LOCALE[key] || LEGACY;
}

module.exports = { starterChannelNames };
