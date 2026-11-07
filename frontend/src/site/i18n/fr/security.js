/**
 * Marketing site catalog for fr, part "security": English source string -> translation.
 * Strings only the page "security" uses; loaded with that page.
 * Written by `node scripts/site-i18n.mjs import | bake | prune | layout` (sorted keys,
 * placed by src/site/siteCatalogParts.js); edit through the tool so every string stays in
 * the part its page loads. Lookup order: the loaded parts, then the app phrases in
 * src/i18n/locales/fr.js (loaded only when a lookup misses), then English.
 */
export default {
  "Accounts": "Comptes",
  "Call media is transmitted with WebRTC security (DTLS/SRTP). Descall never records or stores call audio, video, or screen shares. If a participant records locally on their device, that recording is outside Descall's control.": "Les médias des appels sont transmis avec la sécurité WebRTC (DTLS/SRTP). Descall n'enregistre ni ne conserve jamais l'audio, la vidéo ou les partages d'écran des appels. Si un participant enregistre localement sur son appareil, cet enregistrement échappe au contrôle de Descall.",
  "Descall Security | TLS, WebRTC DTLS/SRTP & Accounts": "Sécurité Descall | TLS, WebRTC DTLS/SRTP et comptes",
  "Descall security: HTTPS/TLS for web, WebRTC DTLS/SRTP for calls, bcrypt passwords, and honest limits, no default E2E claim for stored chat history.": "Sécurité Descall : HTTPS/TLS pour le web, WebRTC DTLS/SRTP pour les appels, mots de passe bcrypt et limites honnêtes (pas d'E2E par défaut stocké).",
  "How Descall protects your chats and calls, encryption in transit, account security, and honest limits about what we do not claim.": "Comment Descall protège tes chats et tes appels : chiffrement en transit, sécurité du compte et limites honnêtes sur ce que nous ne prétendons pas faire.",
  "Passwords are hashed with bcrypt. Optional email 2FA and Google sign-in are available where configured. Session management lets you revoke devices. Keep credentials private on shared computers.": "Les mots de passe sont hachés avec bcrypt. La 2FA facultative par e-mail et la connexion avec Google sont disponibles là où elles sont configurées. La gestion des sessions te permet de révoquer des appareils. Garde tes identifiants privés sur les ordinateurs partagés.",
  "Report an issue": "Signaler un problème",
  "Security at Descall": "La sécurité chez Descall",
  "Transport encryption (not default E2E)": "Chiffrement du transport (pas de chiffrement de bout en bout par défaut)",
  "Voice & video": "Voix et vidéo",
  "Web and API traffic use HTTPS/TLS. Real-time media uses WebRTC with DTLS/SRTP between peers when a call is established. Descall does not claim default end-to-end encryption for all message history stored on the server, messages are encrypted in transit and stored so your devices can load chat history.": "Le trafic web et API utilise HTTPS/TLS. Les médias en temps réel utilisent WebRTC avec DTLS/SRTP entre les participants une fois l'appel établi. Descall ne prétend pas chiffrer de bout en bout par défaut tout l'historique des messages stocké sur le serveur : les messages sont chiffrés en transit et stockés pour que tes appareils puissent charger l'historique du chat.",
  "or open an issue on GitHub. Include enough detail for a safe investigation.": "ou ouvre un ticket sur GitHub. Donne suffisamment de détails pour permettre une enquête en toute sécurité."
};
