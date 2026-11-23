/**
 * 4.2 voice shortcuts: the App Shortcuts the iOS app offers to Siri, Spotlight, the
 * Shortcuts app and the Action Button (ios/App/App/DescallAppIntents.swift), with their
 * phrases in every UI language. Single source of truth:
 *   - scripts/ios-intents-strings.mjs writes <lang>.lproj/AppShortcuts.strings from it;
 *   - Settings > Voice shortcuts lists the phrases (components/settings/VoiceShortcutsPanel.jsx).
 * ${applicationName} is the app name; ${friend}, ${room}, ${status}, ${target} are the
 * intent parameters (same placeholder in every language, checked by the selftest).
 * Order and English keys must match DescallAppShortcuts in the Swift file.
 */

export const SHORTCUT_LOCALES = Object.freeze(["en", "tr", "de", "es", "fr", "pt-BR", "ru"]);

export const VOICE_SHORTCUTS = Object.freeze([
  {
    id: "send",
    intent: "DescallSendMessageIntent",
    symbol: "paperplane.fill",
    phrases: [
      {
        en: "Send a message with ${applicationName}",
        tr: "${applicationName} ile mesaj gönder",
        de: "Sende eine Nachricht mit ${applicationName}",
        es: "Envía un mensaje con ${applicationName}",
        fr: "Envoie un message avec ${applicationName}",
        "pt-BR": "Enviar uma mensagem com o ${applicationName}",
        ru: "Отправь сообщение в ${applicationName}",
      },
      {
        en: "Send a ${applicationName} message",
        tr: "${applicationName} mesajı gönder",
        de: "Sende eine ${applicationName} Nachricht",
        es: "Envía un mensaje de ${applicationName}",
        fr: "Envoie un message ${applicationName}",
        "pt-BR": "Enviar uma mensagem no ${applicationName}",
        ru: "Напиши сообщение в ${applicationName}",
      },
      {
        en: "Message ${friend} on ${applicationName}",
        tr: "${applicationName} ile ${friend} kişisine mesaj gönder",
        de: "Schreib ${friend} auf ${applicationName}",
        es: "Escribe a ${friend} en ${applicationName}",
        fr: "Écris à ${friend} sur ${applicationName}",
        "pt-BR": "Mandar mensagem para ${friend} no ${applicationName}",
        ru: "Напиши ${friend} в ${applicationName}",
      },
    ],
  },
  {
    id: "unread",
    intent: "DescallUnreadIntent",
    symbol: "envelope.badge.fill",
    phrases: [
      {
        en: "How many unread messages do I have on ${applicationName}",
        tr: "${applicationName}'da kaç okunmamış mesajım var",
        de: "Wie viele ungelesene Nachrichten habe ich auf ${applicationName}",
        es: "Cuántos mensajes sin leer tengo en ${applicationName}",
        fr: "Combien de messages non lus ai-je sur ${applicationName}",
        "pt-BR": "Quantas mensagens não lidas eu tenho no ${applicationName}",
        ru: "Сколько у меня непрочитанных сообщений в ${applicationName}",
      },
      {
        en: "Check my ${applicationName} messages",
        tr: "${applicationName} mesajlarımı kontrol et",
        de: "Prüfe meine ${applicationName} Nachrichten",
        es: "Revisa mis mensajes de ${applicationName}",
        fr: "Vérifie mes messages ${applicationName}",
        "pt-BR": "Ver minhas mensagens do ${applicationName}",
        ru: "Проверь мои сообщения в ${applicationName}",
      },
      {
        en: "Any new messages on ${applicationName}",
        tr: "${applicationName}'da yeni mesaj var mı",
        de: "Gibt es neue Nachrichten auf ${applicationName}",
        es: "Hay mensajes nuevos en ${applicationName}",
        fr: "Y a-t-il de nouveaux messages sur ${applicationName}",
        "pt-BR": "Tem mensagens novas no ${applicationName}",
        ru: "Есть новые сообщения в ${applicationName}",
      },
    ],
  },
  {
    id: "online",
    intent: "DescallWhoIsOnlineIntent",
    symbol: "person.2.fill",
    phrases: [
      {
        en: "Who's online on ${applicationName}",
        tr: "${applicationName}'da kim çevrimiçi",
        de: "Wer ist auf ${applicationName} online",
        es: "Quién está conectado en ${applicationName}",
        fr: "Qui est en ligne sur ${applicationName}",
        "pt-BR": "Quem está online no ${applicationName}",
        ru: "Кто в сети в ${applicationName}",
      },
      {
        en: "Which friends are online on ${applicationName}",
        tr: "${applicationName}'da hangi arkadaşlarım çevrimiçi",
        de: "Welche Freunde sind auf ${applicationName} online",
        es: "Qué amigos están conectados en ${applicationName}",
        fr: "Quels amis sont en ligne sur ${applicationName}",
        "pt-BR": "Quais amigos estão online no ${applicationName}",
        ru: "Какие друзья в сети в ${applicationName}",
      },
    ],
  },
  {
    id: "mute",
    intent: "DescallToggleMuteIntent",
    symbol: "mic.slash.fill",
    phrases: [
      {
        en: "Mute ${applicationName}",
        tr: "${applicationName} mikrofonunu kapat",
        de: "Schalte ${applicationName} stumm",
        es: "Silencia ${applicationName}",
        fr: "Coupe le micro sur ${applicationName}",
        "pt-BR": "Silenciar o ${applicationName}",
        ru: "Выключи микрофон в ${applicationName}",
      },
      {
        en: "Unmute ${applicationName}",
        tr: "${applicationName} mikrofonunu aç",
        de: "Hebe die Stummschaltung in ${applicationName} auf",
        es: "Activa el micrófono en ${applicationName}",
        fr: "Réactive le micro sur ${applicationName}",
        "pt-BR": "Ativar o microfone no ${applicationName}",
        ru: "Включи микрофон в ${applicationName}",
      },
      {
        en: "Mute my mic on ${applicationName}",
        tr: "${applicationName}'da mikrofonumu kapat",
        de: "Schalte mein Mikrofon in ${applicationName} stumm",
        es: "Silencia mi micrófono en ${applicationName}",
        fr: "Mets mon micro en sourdine sur ${applicationName}",
        "pt-BR": "Silenciar meu microfone no ${applicationName}",
        ru: "Заглуши мой микрофон в ${applicationName}",
      },
    ],
  },
  {
    id: "deafen",
    intent: "DescallToggleDeafenIntent",
    symbol: "speaker.slash.fill",
    phrases: [
      {
        en: "Deafen ${applicationName}",
        tr: "${applicationName} sesini kapat",
        de: "Schalte den Ton in ${applicationName} aus",
        es: "Desactiva el sonido de ${applicationName}",
        fr: "Coupe le son de ${applicationName}",
        "pt-BR": "Desativar o som do ${applicationName}",
        ru: "Выключи звук в ${applicationName}",
      },
      {
        en: "Undeafen ${applicationName}",
        tr: "${applicationName} sesini aç",
        de: "Schalte den Ton in ${applicationName} ein",
        es: "Activa el sonido de ${applicationName}",
        fr: "Réactive le son de ${applicationName}",
        "pt-BR": "Ativar o som do ${applicationName}",
        ru: "Включи звук в ${applicationName}",
      },
    ],
  },
  {
    id: "leave",
    intent: "DescallLeaveCallIntent",
    symbol: "phone.down.fill",
    phrases: [
      {
        en: "Leave the ${applicationName} call",
        tr: "${applicationName} aramasından çık",
        de: "Verlasse den ${applicationName} Anruf",
        es: "Sal de la llamada de ${applicationName}",
        fr: "Quitte l'appel ${applicationName}",
        "pt-BR": "Sair da chamada do ${applicationName}",
        ru: "Выйди из звонка в ${applicationName}",
      },
      {
        en: "Hang up ${applicationName}",
        tr: "${applicationName} aramasını kapat",
        de: "Leg in ${applicationName} auf",
        es: "Cuelga ${applicationName}",
        fr: "Raccroche ${applicationName}",
        "pt-BR": "Desligar a chamada do ${applicationName}",
        ru: "Положи трубку в ${applicationName}",
      },
    ],
  },
  {
    id: "status",
    intent: "DescallSetStatusIntent",
    symbol: "circle.badge.checkmark",
    phrases: [
      {
        en: "Set my ${applicationName} status",
        tr: "${applicationName} durumumu ayarla",
        de: "Setze meinen ${applicationName} Status",
        es: "Cambia mi estado de ${applicationName}",
        fr: "Change mon statut ${applicationName}",
        "pt-BR": "Mudar meu status no ${applicationName}",
        ru: "Измени мой статус в ${applicationName}",
      },
      {
        en: "Set my ${applicationName} status to ${status}",
        tr: "${applicationName} durumumu ${status} yap",
        de: "Setze meinen ${applicationName} Status auf ${status}",
        es: "Pon mi estado de ${applicationName} en ${status}",
        fr: "Mets mon statut ${applicationName} sur ${status}",
        "pt-BR": "Mudar meu status no ${applicationName} para ${status}",
        ru: "Поставь мой статус в ${applicationName} на ${status}",
      },
    ],
  },
  {
    id: "voice",
    intent: "DescallJoinVoiceIntent",
    symbol: "speaker.wave.2.fill",
    phrases: [
      {
        en: "Join a voice channel on ${applicationName}",
        tr: "${applicationName}'da ses kanalına katıl",
        de: "Tritt einem Sprachkanal in ${applicationName} bei",
        es: "Únete a un canal de voz en ${applicationName}",
        fr: "Rejoins un salon vocal sur ${applicationName}",
        "pt-BR": "Entrar em um canal de voz no ${applicationName}",
        ru: "Подключись к голосовому каналу в ${applicationName}",
      },
      {
        en: "Join ${room} on ${applicationName}",
        tr: "${applicationName}'da ${room} kanalına katıl",
        de: "Tritt ${room} in ${applicationName} bei",
        es: "Únete a ${room} en ${applicationName}",
        fr: "Rejoins ${room} sur ${applicationName}",
        "pt-BR": "Entrar em ${room} no ${applicationName}",
        ru: "Подключись к ${room} в ${applicationName}",
      },
    ],
  },
  {
    id: "chat",
    intent: "DescallOpenFriendIntent",
    symbol: "bubble.left.and.bubble.right.fill",
    phrases: [
      {
        en: "Open a chat in ${applicationName}",
        tr: "${applicationName}'da sohbet aç",
        de: "Öffne einen Chat in ${applicationName}",
        es: "Abre un chat en ${applicationName}",
        fr: "Ouvre une discussion dans ${applicationName}",
        "pt-BR": "Abrir uma conversa no ${applicationName}",
        ru: "Открой чат в ${applicationName}",
      },
      {
        en: "Chat with ${target} on ${applicationName}",
        tr: "${applicationName}'da ${target} ile sohbeti aç",
        de: "Chatte mit ${target} in ${applicationName}",
        es: "Chatea con ${target} en ${applicationName}",
        fr: "Discute avec ${target} sur ${applicationName}",
        "pt-BR": "Conversar com ${target} no ${applicationName}",
        ru: "Открой чат с ${target} в ${applicationName}",
      },
    ],
  },
  {
    id: "place",
    intent: "DescallOpenPlaceIntent",
    symbol: "server.rack",
    phrases: [
      {
        en: "Open a server in ${applicationName}",
        tr: "${applicationName}'da sunucu aç",
        de: "Öffne einen Server in ${applicationName}",
        es: "Abre un servidor en ${applicationName}",
        fr: "Ouvre un serveur dans ${applicationName}",
        "pt-BR": "Abrir um servidor no ${applicationName}",
        ru: "Открой сервер в ${applicationName}",
      },
      {
        en: "Open ${target} in ${applicationName}",
        tr: "${applicationName}'da ${target} aç",
        de: "Öffne ${target} in ${applicationName}",
        es: "Abre ${target} en ${applicationName}",
        fr: "Ouvre ${target} dans ${applicationName}",
        "pt-BR": "Abrir ${target} no ${applicationName}",
        ru: "Открой ${target} в ${applicationName}",
      },
    ],
  },
]);

/** Placeholders a phrase may hold besides ${applicationName}. */
export function phrasePlaceholders(phrase) {
  return [...String(phrase || "").matchAll(/\$\{([A-Za-z]+)\}/g)].map((m) => m[1]).sort();
}

/** A phrase as the user says it: the app name filled in, parameter slots as "…". */
export function speakablePhrase(phrase, { appName = "Descall", slot = "…" } = {}) {
  return String(phrase || "")
    .split("${applicationName}").join(appName)
    .replace(/\$\{[A-Za-z]+\}/g, slot);
}

/** Phrase rows for the Settings list in `locale` (English when a phrase lacks it). */
export function shortcutsForLocale(locale) {
  const lang = SHORTCUT_LOCALES.includes(locale) ? locale : String(locale || "").slice(0, 2);
  const pick = (p) => p[lang] || p[SHORTCUT_LOCALES.find((l) => l.slice(0, 2) === lang)] || p.en;
  return VOICE_SHORTCUTS.map((s) => ({
    id: s.id,
    symbol: s.symbol,
    // The first phrase without a parameter slot reads best as the headline.
    phrase: speakablePhrase(pick(s.phrases.find((p) => phrasePlaceholders(p.en).length === 0) || s.phrases[0])),
    more: s.phrases.length - 1,
  }));
}
