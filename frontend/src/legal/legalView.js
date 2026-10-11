/**
 * Presentation helpers for the legal reader. They never rewrite policy text:
 * excerpts are the existing first paragraph of a section.
 */

const SUMMARY = {
  privacy: [
    { tr: "Ne topluyoruz", en: "What we collect", test: /toplad|collect/i },
    { tr: "Neden", en: "Why", test: /nasıl kullan|how we use/i },
    { tr: "Haklarınız", en: "Your rights", test: /haklar|your rights/i },
    { tr: "İletişim", en: "Contact", test: /ulaşın|contact us/i },
  ],
  terms: [
    { tr: "Kimler kullanır", en: "Who can use it", test: /kabul ve|acceptance and/i },
    { tr: "Kurallar", en: "The rules", test: /kabul edilebilir|acceptable use/i },
    { tr: "Hesabınız", en: "Your account", test: /askıya|suspension/i },
    { tr: "İletişim", en: "Contact", test: /iletişim|contact/i },
  ],
  copyright: [
    { tr: "Bildirim", en: "Notice", test: /bildirimde|notice must/i },
    { tr: "Karşı bildirim", en: "Counter-notice", test: /karşı bildirim|counter-notice/i },
  ],
};

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

export function isRightsHeading(heading) {
  return /haklar|your rights/i.test(String(heading || ""));
}

export function summaryCards(type, data, locale) {
  const specs = SUMMARY[type] || SUMMARY.privacy;
  const sections = data?.sections || [];
  const tr = locale === "tr";
  return specs
    .map((spec) => {
      const index = sections.findIndex((section) => spec.test.test(section.heading));
      if (index < 0) return null;
      const section = sections[index];
      return {
        label: tr ? spec.tr : spec.en,
        heading: section.heading,
        excerpt: section.paragraphs?.[0] || "",
        id: legalSlug(section.heading, index),
      };
    })
    .filter(Boolean);
}

export function contactCopy(type, locale) {
  const tr = locale === "tr";
  const heading = tr ? "İletişim" : "Contact";
  if (type === "copyright") {
    return { heading, before: "", after: " · Demir Sarp Kurtlar" };
  }
  if (type === "terms") {
    return {
      heading,
      before: tr ? "Sorularınız için:" : "Questions:",
      after: " · Demir Sarp Kurtlar (Türkiye)",
    };
  }
  return {
    heading,
    before: tr ? "Gizlilik talepleri için e-posta:" : "For privacy requests, email:",
    after: " · Demir Sarp Kurtlar (Türkiye)",
  };
}

export const LEGAL_EMAIL = "contact@descall.com";

export function tocLabel(locale) {
  return locale === "tr" ? "İçindekiler" : "Contents";
}

export function jumpLabel(locale) {
  return locale === "tr" ? "Bu sayfada" : "On this page";
}

export function briefLabel(locale) {
  return locale === "tr" ? "Kısaca" : "In short";
}
