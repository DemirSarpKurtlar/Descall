/**
 * Presentation helpers for the legal reader. They never rewrite policy text:
 * excerpts are the existing first paragraph of a section.
 */

/**
 * Summary cards point at fixed sections. The section is found in the English
 * document (the same section order is used in every language), so translated
 * headings never break the match.
 */
const SUMMARY = {
  privacy: [
    { key: "collect", test: /toplad|collect/i },
    { key: "why", test: /nasıl kullan|how we use/i },
    { key: "rights", test: /haklar|your rights/i },
    { key: "contact", test: /ulaşın|contact us/i },
  ],
  terms: [
    { key: "who", test: /kabul ve|acceptance and/i },
    { key: "rules", test: /kabul edilebilir|acceptable use/i },
    { key: "account", test: /askıya|suspension/i },
    { key: "contact", test: /iletişim|contact/i },
  ],
  copyright: [
    { key: "notice", test: /bildirimde|notice must/i },
    { key: "counter", test: /karşı bildirim|counter-notice/i },
  ],
};

/** Reader chrome in every UI language (legal pages also render before the app catalogs load). */
const LABELS = {
  en: { collect: "What we collect", why: "Why", rights: "Your rights", contact: "Contact", who: "Who can use it", rules: "The rules", account: "Your account", notice: "Notice", counter: "Counter-notice", toc: "Contents", jump: "On this page", brief: "In short", questions: "Questions:", privacyEmail: "For privacy requests, email:" },
  tr: { collect: "Ne topluyoruz", why: "Neden", rights: "Haklarınız", contact: "İletişim", who: "Kimler kullanır", rules: "Kurallar", account: "Hesabınız", notice: "Bildirim", counter: "Karşı bildirim", toc: "İçindekiler", jump: "Bu sayfada", brief: "Kısaca", questions: "Sorularınız için:", privacyEmail: "Gizlilik talepleri için e-posta:" },
  de: { collect: "Was wir erheben", why: "Warum", rights: "Deine Rechte", contact: "Kontakt", who: "Wer es nutzen darf", rules: "Die Regeln", account: "Dein Konto", notice: "Meldung", counter: "Gegendarstellung", toc: "Inhalt", jump: "Auf dieser Seite", brief: "Kurz gesagt", questions: "Fragen:", privacyEmail: "Datenschutzanfragen per E-Mail an:" },
  es: { collect: "Qué recopilamos", why: "Para qué", rights: "Tus derechos", contact: "Contacto", who: "Quién puede usarlo", rules: "Las reglas", account: "Tu cuenta", notice: "Notificación", counter: "Contranotificación", toc: "Contenido", jump: "En esta página", brief: "En resumen", questions: "Preguntas:", privacyEmail: "Para solicitudes de privacidad, escribe a:" },
  fr: { collect: "Ce que nous collectons", why: "Pourquoi", rights: "Tes droits", contact: "Contact", who: "Qui peut l'utiliser", rules: "Les règles", account: "Ton compte", notice: "Notification", counter: "Contre-notification", toc: "Sommaire", jump: "Sur cette page", brief: "En bref", questions: "Questions :", privacyEmail: "Pour les demandes liées à la confidentialité, écris à :" },
  "pt-BR": { collect: "O que coletamos", why: "Por quê", rights: "Seus direitos", contact: "Contato", who: "Quem pode usar", rules: "As regras", account: "Sua conta", notice: "Notificação", counter: "Contranotificação", toc: "Sumário", jump: "Nesta página", brief: "Em resumo", questions: "Dúvidas:", privacyEmail: "Para solicitações de privacidade, envie um e-mail para:" },
  ru: { collect: "Какие данные мы собираем", why: "Зачем", rights: "Ваши права", contact: "Контакты", who: "Кто может пользоваться", rules: "Правила", account: "Ваш аккаунт", notice: "Уведомление", counter: "Встречное уведомление", toc: "Содержание", jump: "На этой странице", brief: "Коротко", questions: "Вопросы:", privacyEmail: "Запросы о конфиденциальности отправляйте на:" },
};

function labels(locale) {
  return LABELS[locale] || LABELS.en;
}

export function legalSlug(heading, index = 0) {
  const base = String(heading || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || `section-${index + 1}`;
}

/** Rights section: matched by position in the English document when it is given. */
export function isRightsHeading(heading, index, enData) {
  if (enData && Number.isInteger(index)) {
    return /your rights/i.test(String(enData.sections?.[index]?.heading || ""));
  }
  return /haklar|your rights/i.test(String(heading || ""));
}

export function summaryCards(type, data, locale, enData = data) {
  const specs = SUMMARY[type] || SUMMARY.privacy;
  const sections = data?.sections || [];
  const enSections = enData?.sections || sections;
  const L = labels(locale);
  return specs
    .map((spec) => {
      const index = enSections.findIndex((section) => spec.test.test(section.heading));
      if (index < 0 || !sections[index]) return null;
      const section = sections[index];
      return {
        label: L[spec.key],
        heading: section.heading,
        excerpt: section.paragraphs?.[0] || "",
        id: legalSlug(section.heading, index),
      };
    })
    .filter(Boolean);
}

export function contactCopy(type, locale) {
  const L = labels(locale);
  const heading = L.contact;
  if (type === "copyright") {
    return { heading, before: "", after: " · Demir Sarp Kurtlar" };
  }
  if (type === "terms") {
    return { heading, before: L.questions, after: " · Demir Sarp Kurtlar (Türkiye)" };
  }
  return { heading, before: L.privacyEmail, after: " · Demir Sarp Kurtlar (Türkiye)" };
}

export const LEGAL_EMAIL = "contact@descall.com";

export function tocLabel(locale) {
  return labels(locale).toc;
}

export function jumpLabel(locale) {
  return labels(locale).jump;
}

export function briefLabel(locale) {
  return labels(locale).brief;
}
