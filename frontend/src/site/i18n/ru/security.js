/**
 * Marketing site catalog for ru, part "security": English source string -> translation.
 * Strings only the page "security" uses; loaded with that page.
 * Written by `node scripts/site-i18n.mjs import | bake | prune | layout` (sorted keys,
 * placed by src/site/siteCatalogParts.js); edit through the tool so every string stays in
 * the part its page loads. Lookup order: the loaded parts, then the app phrases in
 * src/i18n/locales/ru.js (loaded only when a lookup misses), then English.
 */
export default {
  "Accounts": "Аккаунты",
  "Call media is transmitted with WebRTC security (DTLS/SRTP). Descall never records or stores call audio, video, or screen shares. If a participant records locally on their device, that recording is outside Descall's control.": "Медиаданные звонков передаются с защитой WebRTC (DTLS/SRTP). Descall никогда не записывает и не хранит звук, видео и демонстрацию экрана из звонков. Если участник записывает звонок локально на своём устройстве, эта запись находится вне контроля Descall.",
  "Descall Security | TLS, WebRTC DTLS/SRTP & Accounts": "Безопасность Descall: TLS, WebRTC DTLS/SRTP и аккаунты",
  "Descall security: HTTPS/TLS for web, WebRTC DTLS/SRTP for calls, bcrypt passwords, and honest limits, no default E2E claim for stored chat history.": "Безопасность Descall: HTTPS/TLS в вебе, WebRTC DTLS/SRTP в звонках, пароли с bcrypt и честные ограничения: без сквозного шифрования истории.",
  "How Descall protects your chats and calls, encryption in transit, account security, and honest limits about what we do not claim.": "Как Descall защищает ваши чаты и звонки: шифрование при передаче, безопасность аккаунта и честно о том, чего мы не обещаем.",
  "Passwords are hashed with bcrypt. Optional email 2FA and Google sign-in are available where configured. Session management lets you revoke devices. Keep credentials private on shared computers.": "Пароли хешируются с помощью bcrypt. Где это настроено, доступны необязательная 2FA по e-mail и вход через Google. Управление сеансами позволяет отключать устройства. На общих компьютерах держите данные для входа в тайне.",
  "Report an issue": "Сообщить о проблеме",
  "Security at Descall": "Безопасность в Descall",
  "Transport encryption (not default E2E)": "Шифрование при передаче (не сквозное по умолчанию)",
  "Voice & video": "Голос и видео",
  "Web and API traffic use HTTPS/TLS. Real-time media uses WebRTC with DTLS/SRTP between peers when a call is established. Descall does not claim default end-to-end encryption for all message history stored on the server, messages are encrypted in transit and stored so your devices can load chat history.": "Веб- и API-трафик идёт через HTTPS/TLS. Медиаданные в реальном времени передаются через WebRTC с DTLS/SRTP между участниками после установки звонка. Descall не заявляет сквозного шифрования по умолчанию для всей истории сообщений на сервере: сообщения шифруются при передаче и хранятся, чтобы ваши устройства могли загружать историю чата.",
  "or open an issue on GitHub. Include enough detail for a safe investigation.": "или создайте issue на GitHub. Приложите достаточно подробностей для безопасного расследования."
};
