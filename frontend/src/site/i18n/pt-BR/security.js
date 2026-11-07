/**
 * Marketing site catalog for pt-BR, part "security": English source string -> translation.
 * Strings only the page "security" uses; loaded with that page.
 * Written by `node scripts/site-i18n.mjs import | bake | prune | layout` (sorted keys,
 * placed by src/site/siteCatalogParts.js); edit through the tool so every string stays in
 * the part its page loads. Lookup order: the loaded parts, then the app phrases in
 * src/i18n/locales/pt-BR.js (loaded only when a lookup misses), then English.
 */
export default {
  "Accounts": "Contas",
  "Call media is transmitted with WebRTC security (DTLS/SRTP). Descall never records or stores call audio, video, or screen shares. If a participant records locally on their device, that recording is outside Descall's control.": "A mídia das chamadas é transmitida com a segurança do WebRTC (DTLS/SRTP). O Descall nunca grava nem armazena o áudio, o vídeo ou o compartilhamento de tela das chamadas. Se um participante gravar localmente no próprio dispositivo, essa gravação está fora do controle do Descall.",
  "Descall Security | TLS, WebRTC DTLS/SRTP & Accounts": "Segurança do Descall | TLS, WebRTC DTLS/SRTP e contas",
  "Descall security: HTTPS/TLS for web, WebRTC DTLS/SRTP for calls, bcrypt passwords, and honest limits, no default E2E claim for stored chat history.": "Segurança do Descall: HTTPS/TLS na web, WebRTC DTLS/SRTP nas chamadas, senhas com bcrypt e limites honestos, sem E2E padrão no histórico salvo.",
  "How Descall protects your chats and calls, encryption in transit, account security, and honest limits about what we do not claim.": "Como o Descall protege seus chats e chamadas: criptografia em trânsito, segurança da conta e limites honestos sobre o que não afirmamos.",
  "Passwords are hashed with bcrypt. Optional email 2FA and Google sign-in are available where configured. Session management lets you revoke devices. Keep credentials private on shared computers.": "As senhas são protegidas com hash bcrypt. 2FA opcional por e-mail e login com Google estão disponíveis onde configurados. O gerenciamento de sessões permite revogar dispositivos. Mantenha suas credenciais em sigilo em computadores compartilhados.",
  "Report an issue": "Relatar um problema",
  "Security at Descall": "Segurança no Descall",
  "Transport encryption (not default E2E)": "Criptografia em trânsito (sem E2E por padrão)",
  "Voice & video": "Voz e vídeo",
  "Web and API traffic use HTTPS/TLS. Real-time media uses WebRTC with DTLS/SRTP between peers when a call is established. Descall does not claim default end-to-end encryption for all message history stored on the server, messages are encrypted in transit and stored so your devices can load chat history.": "O tráfego da web e da API usa HTTPS/TLS. A mídia em tempo real usa WebRTC com DTLS/SRTP entre os participantes quando uma chamada é estabelecida. O Descall não afirma ter criptografia de ponta a ponta por padrão para todo o histórico de mensagens armazenado no servidor; as mensagens são criptografadas em trânsito e armazenadas para que seus dispositivos possam carregar o histórico do chat.",
  "or open an issue on GitHub. Include enough detail for a safe investigation.": "ou abra uma issue no GitHub. Inclua detalhes suficientes para uma investigação segura."
};
