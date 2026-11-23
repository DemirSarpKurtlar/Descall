/**
 * Catalog of the human check card (lib/humanCheck/turnstileClient.js). The card is plain
 * DOM shown by the app and by the marketing sign-in shell, which do not share a catalog
 * loader, so its few strings live here in all seven app languages.
 */
export const HUMAN_CHECK_TEXT = Object.freeze({
  tr: {
    title: "Güvenlik doğrulaması",
    body: "Bot olmadığını doğrulamak için aşağıdaki kutuyu işaretle.",
    working: "Doğrulanıyor…",
    cancel: "Vazgeç",
    retry: "Tekrar dene",
    expired: "Doğrulamanın süresi doldu. Tekrar dene.",
    failed: "Doğrulama tamamlanamadı. Tekrar dene.",
    cancelled: "Güvenlik doğrulaması iptal edildi.",
    footnote: "Cloudflare Turnstile ile korunuyor",
  },
  en: {
    title: "Security check",
    body: "Tick the box below to confirm you are not a bot.",
    working: "Checking…",
    cancel: "Cancel",
    retry: "Try again",
    expired: "The check expired. Try again.",
    failed: "The check could not be completed. Try again.",
    cancelled: "The security check was cancelled.",
    footnote: "Protected by Cloudflare Turnstile",
  },
  de: {
    title: "Sicherheitsprüfung",
    body: "Setze das Häkchen unten, um zu bestätigen, dass du kein Bot bist.",
    working: "Wird geprüft…",
    cancel: "Abbrechen",
    retry: "Erneut versuchen",
    expired: "Die Prüfung ist abgelaufen. Versuche es erneut.",
    failed: "Die Prüfung konnte nicht abgeschlossen werden. Versuche es erneut.",
    cancelled: "Die Sicherheitsprüfung wurde abgebrochen.",
    footnote: "Geschützt durch Cloudflare Turnstile",
  },
  es: {
    title: "Verificación de seguridad",
    body: "Marca la casilla de abajo para confirmar que no eres un bot.",
    working: "Verificando…",
    cancel: "Cancelar",
    retry: "Reintentar",
    expired: "La verificación caducó. Inténtalo de nuevo.",
    failed: "No se pudo completar la verificación. Inténtalo de nuevo.",
    cancelled: "Se canceló la verificación de seguridad.",
    footnote: "Protegido por Cloudflare Turnstile",
  },
  fr: {
    title: "Vérification de sécurité",
    body: "Coche la case ci-dessous pour confirmer que tu n'es pas un robot.",
    working: "Vérification…",
    cancel: "Annuler",
    retry: "Réessayer",
    expired: "La vérification a expiré. Réessaie.",
    failed: "La vérification n'a pas pu aboutir. Réessaie.",
    cancelled: "La vérification de sécurité a été annulée.",
    footnote: "Protégé par Cloudflare Turnstile",
  },
  "pt-BR": {
    title: "Verificação de segurança",
    body: "Marque a caixa abaixo para confirmar que você não é um robô.",
    working: "Verificando…",
    cancel: "Cancelar",
    retry: "Tentar novamente",
    expired: "A verificação expirou. Tente novamente.",
    failed: "Não foi possível concluir a verificação. Tente novamente.",
    cancelled: "A verificação de segurança foi cancelada.",
    footnote: "Protegido pelo Cloudflare Turnstile",
  },
  ru: {
    title: "Проверка безопасности",
    body: "Отметьте флажок ниже, чтобы подтвердить, что вы не бот.",
    working: "Проверяем…",
    cancel: "Отмена",
    retry: "Повторить",
    expired: "Время проверки истекло. Повторите попытку.",
    failed: "Не удалось завершить проверку. Повторите попытку.",
    cancelled: "Проверка безопасности отменена.",
    footnote: "Защищено Cloudflare Turnstile",
  },
});

/** Turnstile `language` codes for the app locales. */
export const TURNSTILE_LANGUAGE = Object.freeze({ tr: "tr", en: "en", de: "de", es: "es", fr: "fr", "pt-BR": "pt-br", ru: "ru" });

export function humanCheckStrings(locale) {
  const l = String(locale || "");
  if (HUMAN_CHECK_TEXT[l]) return HUMAN_CHECK_TEXT[l];
  const base = l.split("-")[0].toLowerCase();
  if (base === "pt") return HUMAN_CHECK_TEXT["pt-BR"];
  return HUMAN_CHECK_TEXT[base] || HUMAN_CHECK_TEXT.tr;
}

export function turnstileLanguage(locale) {
  const l = String(locale || "");
  if (TURNSTILE_LANGUAGE[l]) return TURNSTILE_LANGUAGE[l];
  const base = l.split("-")[0].toLowerCase();
  if (base === "pt") return "pt-br";
  return TURNSTILE_LANGUAGE[base] || "tr";
}
