/**
 * Marketing site catalog for de, part "security": English source string -> translation.
 * Strings only the page "security" uses; loaded with that page.
 * Written by `node scripts/site-i18n.mjs import | bake | prune | layout` (sorted keys,
 * placed by src/site/siteCatalogParts.js); edit through the tool so every string stays in
 * the part its page loads. Lookup order: the loaded parts, then the app phrases in
 * src/i18n/locales/de.js (loaded only when a lookup misses), then English.
 */
export default {
  "Accounts": "Konten",
  "Call media is transmitted with WebRTC security (DTLS/SRTP). Descall never records or stores call audio, video, or screen shares. If a participant records locally on their device, that recording is outside Descall's control.": "Anrufmedien werden mit WebRTC-Sicherheit (DTLS/SRTP) übertragen. Descall zeichnet Audio, Video und Bildschirmübertragungen von Anrufen niemals auf und speichert sie nicht. Wenn ein Teilnehmer lokal auf seinem Gerät aufzeichnet, liegt diese Aufnahme außerhalb der Kontrolle von Descall.",
  "Descall Security | TLS, WebRTC DTLS/SRTP & Accounts": "Descall-Sicherheit | TLS, WebRTC DTLS/SRTP & Konten",
  "Descall security: HTTPS/TLS for web, WebRTC DTLS/SRTP for calls, bcrypt passwords, and honest limits, no default E2E claim for stored chat history.": "Descall-Sicherheit: HTTPS/TLS im Web, WebRTC DTLS/SRTP für Anrufe, bcrypt für Passwörter und ehrliche Grenzen: kein Standard-E2E für gespeicherte Chats.",
  "How Descall protects your chats and calls, encryption in transit, account security, and honest limits about what we do not claim.": "Wie Descall deine Chats und Anrufe schützt: Verschlüsselung bei der Übertragung, Kontosicherheit und ehrliche Grenzen dessen, was wir nicht behaupten.",
  "Passwords are hashed with bcrypt. Optional email 2FA and Google sign-in are available where configured. Session management lets you revoke devices. Keep credentials private on shared computers.": "Passwörter werden mit bcrypt gehasht. Optionale E-Mail-2FA und Google-Anmeldung sind verfügbar, wo sie eingerichtet sind. Über die Sitzungsverwaltung kannst du Geräte abmelden. Halte deine Zugangsdaten auf gemeinsam genutzten Computern privat.",
  "Report an issue": "Problem melden",
  "Security at Descall": "Sicherheit bei Descall",
  "Transport encryption (not default E2E)": "Transportverschlüsselung (standardmäßig kein E2E)",
  "Voice & video": "Sprache & Video",
  "Web and API traffic use HTTPS/TLS. Real-time media uses WebRTC with DTLS/SRTP between peers when a call is established. Descall does not claim default end-to-end encryption for all message history stored on the server, messages are encrypted in transit and stored so your devices can load chat history.": "Web- und API-Verkehr laufen über HTTPS/TLS. Echtzeitmedien nutzen WebRTC mit DTLS/SRTP zwischen den Teilnehmern, sobald ein Anruf aufgebaut ist. Descall behauptet keine standardmäßige Ende-zu-Ende-Verschlüsselung für den gesamten auf dem Server gespeicherten Nachrichtenverlauf; Nachrichten werden bei der Übertragung verschlüsselt und gespeichert, damit deine Geräte den Chatverlauf laden können.",
  "or open an issue on GitHub. Include enough detail for a safe investigation.": "oder eröffne ein Issue auf GitHub. Gib genug Details an, damit wir sicher nachforschen können."
};
