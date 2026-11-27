"use strict";

/**
 * Davet ödülleri: text that reaches a person (stored on referral_notices and shown in their
 * Davet Merkezi / as a toast), in the recipient's language. The admin sees exactly this text
 * as "Bora'nın göreceği" before confirming. Also the ready-made "Dürt" messages.
 * Seven locales: tr, en, de, es, fr, pt-BR, ru. Turkish uses the "sen" form.
 */

const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];

function langOf(raw) {
  const s = String(raw || "").trim();
  if (LOCALES.includes(s)) return s;
  const base = s.slice(0, 2).toLowerCase();
  if (base === "pt") return "pt-BR";
  return LOCALES.includes(base) ? base : "tr";
}

/**
 * Turkish possessive suffix after a number written with digits: 7'si, 3'ü, 10'u, 6'sı.
 * The vowel follows the last spoken word of the number (vowel harmony, buffer "s" after a vowel).
 */
function trPossessive(n) {
  const v = Math.abs(Math.floor(Number(n) || 0));
  const UNITS = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
  const TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
  let word;
  if (v === 0) word = "sıfır";
  else if (v % 10) word = UNITS[v % 10];
  else if (v % 100) word = TENS[(v % 100) / 10];
  else if (v % 1000) word = "yüz";
  else if (v % 1000000) word = "bin";
  else word = "milyon";
  const vowels = word.match(/[aeıioöuü]/g) || ["e"];
  const last = vowels[vowels.length - 1];
  const harmony = { a: "ı", ı: "ı", e: "i", i: "i", o: "u", u: "u", ö: "ü", ü: "ü" }[last];
  const endsVowel = /[aeıioöuü]$/.test(word);
  return `${v}'${endsVowel ? "s" : ""}${harmony}`;
}

const REASONS = {
  tr: {
    same_device: "aynı cihazdan açılmış hesaplar",
    disposable_email: "geçici e-posta adresleriyle açılmış hesaplar",
    fake_activity: "gerçek olmayan etkinlik",
    anomaly: "kısa sürede olağan dışı sayıda kayıt",
    other: "kurallara uymayan davetler",
  },
  en: {
    same_device: "accounts opened from the same device",
    disposable_email: "accounts opened with throwaway email addresses",
    fake_activity: "activity that was not genuine",
    anomaly: "an unusual number of sign-ups in a short time",
    other: "invites that did not follow the rules",
  },
  de: {
    same_device: "Konten, die auf demselben Gerät erstellt wurden",
    disposable_email: "Konten mit Wegwerf-E-Mail-Adressen",
    fake_activity: "Aktivität, die nicht echt war",
    anomaly: "ungewöhnlich viele Anmeldungen in kurzer Zeit",
    other: "Einladungen, die nicht den Regeln entsprachen",
  },
  es: {
    same_device: "cuentas creadas desde el mismo dispositivo",
    disposable_email: "cuentas creadas con correos temporales",
    fake_activity: "actividad que no era real",
    anomaly: "un número inusual de registros en poco tiempo",
    other: "invitaciones que no cumplían las reglas",
  },
  fr: {
    same_device: "des comptes créés depuis le même appareil",
    disposable_email: "des comptes créés avec des adresses e-mail jetables",
    fake_activity: "une activité qui n'était pas réelle",
    anomaly: "un nombre inhabituel d'inscriptions en peu de temps",
    other: "des invitations qui ne respectaient pas les règles",
  },
  "pt-BR": {
    same_device: "contas criadas no mesmo aparelho",
    disposable_email: "contas criadas com e-mails temporários",
    fake_activity: "atividade que não era real",
    anomaly: "um número incomum de cadastros em pouco tempo",
    other: "convites que não seguiam as regras",
  },
  ru: {
    same_device: "аккаунты, созданные с одного устройства",
    disposable_email: "аккаунты с одноразовой почтой",
    fake_activity: "ненастоящая активность",
    anomaly: "необычно много регистраций за короткое время",
    other: "приглашения, нарушающие правила",
  },
};

const REASON_CODES = Object.keys(REASONS.tr);

const T = {
  tr: {
    revokeInviter: ({ count, amount, reason }) =>
      `Davetlerinden ${trPossessive(count)} incelendi ve ödül şartlarını karşılamadı (${reason}). ${amount} D geri alındı. Hata olduğunu düşünüyorsan Destek'e yazabilirsin.`,
    revokeInviterNoMoney: ({ count, reason }) =>
      `Davetlerinden ${trPossessive(count)} incelendi ve ödül şartlarını karşılamadı (${reason}). Bu davetler için ödül verilmeyecek. Hata olduğunu düşünüyorsan Destek'e yazabilirsin.`,
    revokeInvitee: ({ reason }) =>
      `Davetle gelen hoş geldin hediyen incelendi ve şartları karşılamadı (${reason}). Hata olduğunu düşünüyorsan Destek'e yazabilirsin.`,
    holdInviter: ({ count, reason }) =>
      `Davetlerinden ${trPossessive(count)} incelemeye alındı (${reason}). Ödülleri inceleme bitene kadar bekliyor; sonuç sana bildirilecek.`,
    releaseInviter: ({ count }) => `İnceleme bitti: ${count} davetin için ödüller yeniden açıldı.`,
    pausedInviter: () => `Davet bağlantın şimdilik durduruldu. Bu sürede gelen kayıtlar ödül kazandırmaz. Sorun olduğunu düşünüyorsan Destek'e yazabilirsin.`,
    resumedInviter: () => `Davet bağlantın yeniden açıldı.`,
    nudge: [
      ({ name }) => `Selam ${name}! Descall'a hoş geldin. Bir merhaba yaz, sohbet hazır.`,
      ({ name }) => `${name}, geldiğine sevindim! Bu akşam seslide misin?`,
      ({ name }) => `Hey ${name}, buradayım. Bir mesaj at, sana sunucuları göstereyim.`,
    ],
  },
  en: {
    revokeInviter: ({ count, amount, reason }) =>
      `${count} of your invites were reviewed and did not meet the reward rules (${reason}). ${amount} D was taken back. If you think this is a mistake, write to Support.`,
    revokeInviterNoMoney: ({ count, reason }) =>
      `${count} of your invites were reviewed and did not meet the reward rules (${reason}). These invites will not be rewarded. If you think this is a mistake, write to Support.`,
    revokeInvitee: ({ reason }) =>
      `Your invite welcome gift was reviewed and did not meet the rules (${reason}). If you think this is a mistake, write to Support.`,
    holdInviter: ({ count, reason }) =>
      `${count} of your invites are under review (${reason}). Their rewards wait until the review ends; we will let you know.`,
    releaseInviter: ({ count }) => `Review finished: rewards are open again for ${count} of your invites.`,
    pausedInviter: () => `Your invite link is paused for now. Sign-ups during this time do not earn rewards. If you think this is a mistake, write to Support.`,
    resumedInviter: () => `Your invite link is active again.`,
    nudge: [
      ({ name }) => `Hi ${name}! Welcome to Descall. Say hello, the chat is ready.`,
      ({ name }) => `${name}, glad you made it! Are you joining voice tonight?`,
      ({ name }) => `Hey ${name}, I'm here. Send me a message and I'll show you the servers.`,
    ],
  },
  de: {
    revokeInviter: ({ count, amount, reason }) =>
      `${count} deiner Einladungen wurden geprüft und erfüllen die Belohnungsregeln nicht (${reason}). ${amount} D wurden zurückgebucht. Wenn du denkst, dass das ein Fehler ist, schreib dem Support.`,
    revokeInviterNoMoney: ({ count, reason }) =>
      `${count} deiner Einladungen wurden geprüft und erfüllen die Belohnungsregeln nicht (${reason}). Für diese Einladungen gibt es keine Belohnung. Wenn du denkst, dass das ein Fehler ist, schreib dem Support.`,
    revokeInvitee: ({ reason }) =>
      `Dein Willkommensgeschenk aus der Einladung wurde geprüft und erfüllt die Regeln nicht (${reason}). Wenn du denkst, dass das ein Fehler ist, schreib dem Support.`,
    holdInviter: ({ count, reason }) =>
      `${count} deiner Einladungen werden geprüft (${reason}). Die Belohnungen warten bis zum Ende der Prüfung; wir sagen dir Bescheid.`,
    releaseInviter: ({ count }) => `Prüfung beendet: Die Belohnungen für ${count} deiner Einladungen sind wieder offen.`,
    pausedInviter: () => `Dein Einladungslink ist vorerst pausiert. Anmeldungen in dieser Zeit bringen keine Belohnung. Wenn du denkst, dass das ein Fehler ist, schreib dem Support.`,
    resumedInviter: () => `Dein Einladungslink ist wieder aktiv.`,
    nudge: [
      ({ name }) => `Hi ${name}! Willkommen bei Descall. Sag kurz Hallo, der Chat ist bereit.`,
      ({ name }) => `${name}, schön, dass du da bist! Bist du heute Abend im Sprachkanal?`,
      ({ name }) => `Hey ${name}, ich bin hier. Schreib mir, dann zeige ich dir die Server.`,
    ],
  },
  es: {
    revokeInviter: ({ count, amount, reason }) =>
      `Revisamos ${count} de tus invitaciones y no cumplieron las reglas de recompensa (${reason}). Se retiraron ${amount} D. Si crees que es un error, escribe a Soporte.`,
    revokeInviterNoMoney: ({ count, reason }) =>
      `Revisamos ${count} de tus invitaciones y no cumplieron las reglas de recompensa (${reason}). Estas invitaciones no tendrán recompensa. Si crees que es un error, escribe a Soporte.`,
    revokeInvitee: ({ reason }) =>
      `Revisamos tu regalo de bienvenida por invitación y no cumplió las reglas (${reason}). Si crees que es un error, escribe a Soporte.`,
    holdInviter: ({ count, reason }) =>
      `${count} de tus invitaciones están en revisión (${reason}). Sus recompensas esperan hasta que termine; te avisaremos.`,
    releaseInviter: ({ count }) => `Revisión terminada: las recompensas de ${count} de tus invitaciones vuelven a estar abiertas.`,
    pausedInviter: () => `Tu enlace de invitación está en pausa por ahora. Los registros de este periodo no dan recompensa. Si crees que es un error, escribe a Soporte.`,
    resumedInviter: () => `Tu enlace de invitación vuelve a estar activo.`,
    nudge: [
      ({ name }) => `¡Hola ${name}! Bienvenido a Descall. Saluda, el chat está listo.`,
      ({ name }) => `${name}, ¡qué bien que llegaste! ¿Te unes a la voz esta noche?`,
      ({ name }) => `Hey ${name}, aquí estoy. Escríbeme y te enseño los servidores.`,
    ],
  },
  fr: {
    revokeInviter: ({ count, amount, reason }) =>
      `${count} de tes invitations ont été vérifiées et ne remplissaient pas les règles de récompense (${reason}). ${amount} D ont été repris. Si tu penses que c'est une erreur, écris au Support.`,
    revokeInviterNoMoney: ({ count, reason }) =>
      `${count} de tes invitations ont été vérifiées et ne remplissaient pas les règles de récompense (${reason}). Ces invitations ne seront pas récompensées. Si tu penses que c'est une erreur, écris au Support.`,
    revokeInvitee: ({ reason }) =>
      `Ton cadeau de bienvenue d'invitation a été vérifié et ne remplissait pas les règles (${reason}). Si tu penses que c'est une erreur, écris au Support.`,
    holdInviter: ({ count, reason }) =>
      `${count} de tes invitations sont en cours de vérification (${reason}). Leurs récompenses attendent la fin de la vérification ; on te préviendra.`,
    releaseInviter: ({ count }) => `Vérification terminée : les récompenses de ${count} de tes invitations sont de nouveau ouvertes.`,
    pausedInviter: () => `Ton lien d'invitation est en pause pour le moment. Les inscriptions pendant cette période ne donnent pas de récompense. Si tu penses que c'est une erreur, écris au Support.`,
    resumedInviter: () => `Ton lien d'invitation est de nouveau actif.`,
    nudge: [
      ({ name }) => `Salut ${name} ! Bienvenue sur Descall. Dis bonjour, la discussion est prête.`,
      ({ name }) => `${name}, content que tu sois là ! Tu viens en vocal ce soir ?`,
      ({ name }) => `Hey ${name}, je suis là. Écris-moi et je te montre les serveurs.`,
    ],
  },
  "pt-BR": {
    revokeInviter: ({ count, amount, reason }) =>
      `${count} dos seus convites foram revisados e não cumpriram as regras de recompensa (${reason}). ${amount} D foram retirados. Se acha que é um erro, escreva para o Suporte.`,
    revokeInviterNoMoney: ({ count, reason }) =>
      `${count} dos seus convites foram revisados e não cumpriram as regras de recompensa (${reason}). Esses convites não terão recompensa. Se acha que é um erro, escreva para o Suporte.`,
    revokeInvitee: ({ reason }) =>
      `Seu presente de boas-vindas do convite foi revisado e não cumpriu as regras (${reason}). Se acha que é um erro, escreva para o Suporte.`,
    holdInviter: ({ count, reason }) =>
      `${count} dos seus convites estão em revisão (${reason}). As recompensas esperam o fim da revisão; vamos te avisar.`,
    releaseInviter: ({ count }) => `Revisão concluída: as recompensas de ${count} dos seus convites foram liberadas de novo.`,
    pausedInviter: () => `Seu link de convite está pausado por enquanto. Cadastros neste período não geram recompensa. Se acha que é um erro, escreva para o Suporte.`,
    resumedInviter: () => `Seu link de convite está ativo de novo.`,
    nudge: [
      ({ name }) => `Oi ${name}! Bem-vindo ao Descall. Manda um oi, o chat está pronto.`,
      ({ name }) => `${name}, que bom que você chegou! Vai entrar na voz hoje à noite?`,
      ({ name }) => `Ei ${name}, estou aqui. Me manda uma mensagem que eu te mostro os servidores.`,
    ],
  },
  ru: {
    revokeInviter: ({ count, amount, reason }) =>
      `Приглашения (${count}) проверены и не соответствуют правилам награды (${reason}). Списано ${amount} D. Если считаешь, что это ошибка, напиши в поддержку.`,
    revokeInviterNoMoney: ({ count, reason }) =>
      `Приглашения (${count}) проверены и не соответствуют правилам награды (${reason}). Награды за них не будет. Если считаешь, что это ошибка, напиши в поддержку.`,
    revokeInvitee: ({ reason }) =>
      `Твой приветственный подарок по приглашению проверен и не соответствует правилам (${reason}). Если считаешь, что это ошибка, напиши в поддержку.`,
    holdInviter: ({ count, reason }) =>
      `Приглашения (${count}) на проверке (${reason}). Награды ждут её окончания, мы сообщим результат.`,
    releaseInviter: ({ count }) => `Проверка завершена: награды за приглашения (${count}) снова доступны.`,
    pausedInviter: () => `Твоя ссылка-приглашение пока приостановлена. Регистрации в это время не дают награды. Если считаешь, что это ошибка, напиши в поддержку.`,
    resumedInviter: () => `Твоя ссылка-приглашение снова активна.`,
    nudge: [
      ({ name }) => `Привет, ${name}! Добро пожаловать в Descall. Напиши привет, чат готов.`,
      ({ name }) => `${name}, рад, что ты здесь! Зайдёшь вечером в голосовой?`,
      ({ name }) => `Эй, ${name}, я тут. Напиши мне, покажу серверы.`,
    ],
  },
};

function reasonText(code, lang) {
  const L = langOf(lang);
  return (REASONS[L] || REASONS.tr)[code] || (REASONS[L] || REASONS.tr).other;
}

/**
 * Notice text. kind: revokeInviter | revokeInvitee | holdInviter | releaseInviter |
 * pausedInviter | resumedInviter. An admin note (free text) replaces the reason phrase only
 * for reason "other".
 */
function noticeText(kind, { lang = "tr", count = 1, amount = 0, reasonCode = "other", note = "" } = {}) {
  const L = langOf(lang);
  const pack = T[L] || T.tr;
  const model = require("./model");
  let reason = reasonText(reasonCode, L);
  const cleanNote = String(note || "").replace(/\s+/g, " ").trim().slice(0, 140);
  if (reasonCode === "other" && cleanNote) reason = cleanNote;
  const args = { count, amount: model.formatAmount(amount, L), reason };
  if (kind === "revokeInviter" && !(Number(amount) > 0)) return pack.revokeInviterNoMoney(args);
  const fn = pack[kind];
  return typeof fn === "function" ? fn(args) : "";
}

/** One of the ready "Dürt" messages, picked by `variant` (0..2). */
function nudgeText({ lang = "tr", name = "", variant = 0 } = {}) {
  const pack = T[langOf(lang)] || T.tr;
  const list = pack.nudge;
  const fn = list[Math.abs(Math.floor(Number(variant) || 0)) % list.length];
  return fn({ name: String(name || "").slice(0, 40) });
}

module.exports = { LOCALES, REASON_CODES, langOf, trPossessive, reasonText, noticeText, nudgeText };
