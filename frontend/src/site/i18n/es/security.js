/**
 * Marketing site catalog for es, part "security": English source string -> translation.
 * Strings only the page "security" uses; loaded with that page.
 * Written by `node scripts/site-i18n.mjs import | bake | prune | layout` (sorted keys,
 * placed by src/site/siteCatalogParts.js); edit through the tool so every string stays in
 * the part its page loads. Lookup order: the loaded parts, then the app phrases in
 * src/i18n/locales/es.js (loaded only when a lookup misses), then English.
 */
export default {
  "Accounts": "Cuentas",
  "Call media is transmitted with WebRTC security (DTLS/SRTP). Descall never records or stores call audio, video, or screen shares. If a participant records locally on their device, that recording is outside Descall's control.": "Los medios de las llamadas se transmiten con la seguridad de WebRTC (DTLS/SRTP). Descall nunca graba ni almacena el audio, el video ni las pantallas compartidas de las llamadas. Si un participante graba localmente en su dispositivo, esa grabación queda fuera del control de Descall.",
  "Descall Security | TLS, WebRTC DTLS/SRTP & Accounts": "Seguridad de Descall | TLS, WebRTC DTLS/SRTP y cuentas",
  "Descall security: HTTPS/TLS for web, WebRTC DTLS/SRTP for calls, bcrypt passwords, and honest limits, no default E2E claim for stored chat history.": "Seguridad de Descall: HTTPS/TLS en la web, WebRTC DTLS/SRTP en llamadas, contraseñas bcrypt y límites honestos: sin E2E por defecto en el historial.",
  "How Descall protects your chats and calls, encryption in transit, account security, and honest limits about what we do not claim.": "Cómo Descall protege tus chats y llamadas: cifrado en tránsito, seguridad de la cuenta y límites honestos sobre lo que no afirmamos.",
  "Passwords are hashed with bcrypt. Optional email 2FA and Google sign-in are available where configured. Session management lets you revoke devices. Keep credentials private on shared computers.": "Las contraseñas se guardan con hash bcrypt. La verificación en dos pasos opcional por correo y el inicio de sesión con Google están disponibles donde estén configurados. La gestión de sesiones te permite revocar dispositivos. Mantén tus credenciales en privado en computadoras compartidas.",
  "Report an issue": "Reportar un problema",
  "Security at Descall": "Seguridad en Descall",
  "Transport encryption (not default E2E)": "Cifrado en tránsito (no E2E por defecto)",
  "Voice & video": "Voz y video",
  "Web and API traffic use HTTPS/TLS. Real-time media uses WebRTC with DTLS/SRTP between peers when a call is established. Descall does not claim default end-to-end encryption for all message history stored on the server, messages are encrypted in transit and stored so your devices can load chat history.": "El tráfico web y de la API usa HTTPS/TLS. Los medios en tiempo real usan WebRTC con DTLS/SRTP entre los participantes cuando se establece una llamada. Descall no afirma ofrecer cifrado de extremo a extremo por defecto para todo el historial de mensajes almacenado en el servidor; los mensajes se cifran en tránsito y se almacenan para que tus dispositivos puedan cargar el historial del chat.",
  "or open an issue on GitHub. Include enough detail for a safe investigation.": "o abre una incidencia en GitHub. Incluye suficientes detalles para una investigación segura."
};
