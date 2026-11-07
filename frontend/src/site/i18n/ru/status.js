/**
 * Marketing site catalog for ru, part "status": English source string -> translation.
 * Strings only the page "status" uses; loaded with that page.
 * Written by `node scripts/site-i18n.mjs import | bake | prune | layout` (sorted keys,
 * placed by src/site/siteCatalogParts.js); edit through the tool so every string stays in
 * the part its page loads. Lookup order: the loaded parts, then the app phrases in
 * src/i18n/locales/ru.js (loaded only when a lookup misses), then English.
 */
export default {
  "API / realtime": "API / реальное время",
  "API reachable": "API доступен",
  "Degraded": "Работает с перебоями",
  "Descall Status | Beta service & API health": "Статус Descall: бета-сервис и состояние API",
  "Descall public status: Beta product stage, API health probe, transport security, and how to reach support.": "Публичный статус Descall: стадия продукта (бета), проверка состояния API, безопасность передачи данных и как связаться с поддержкой.",
  "Descall service status": "Статус сервисов Descall",
  "Network error": "Ошибка сети",
  "Operational": "Работает",
  "Product stage": "Стадия продукта",
  "Request timed out": "Время ожидания запроса истекло",
  "Security details": "Подробнее о безопасности",
  "The API row is checked live from your browser each time you open this page.": "Строка API проверяется в реальном времени из вашего браузера при каждом открытии этой страницы.",
  "Transport security": "Безопасность передачи данных",
  "Unreachable from this browser": "Недоступен из этого браузера"
};
