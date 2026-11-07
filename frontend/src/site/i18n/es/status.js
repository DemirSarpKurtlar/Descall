/**
 * Marketing site catalog for es, part "status": English source string -> translation.
 * Strings only the page "status" uses; loaded with that page.
 * Written by `node scripts/site-i18n.mjs import | bake | prune | layout` (sorted keys,
 * placed by src/site/siteCatalogParts.js); edit through the tool so every string stays in
 * the part its page loads. Lookup order: the loaded parts, then the app phrases in
 * src/i18n/locales/es.js (loaded only when a lookup misses), then English.
 */
export default {
  "API / realtime": "API / tiempo real",
  "API reachable": "API accesible",
  "Degraded": "Degradado",
  "Descall Status | Beta service & API health": "Estado de Descall | Servicio en beta y estado de la API",
  "Descall public status: Beta product stage, API health probe, transport security, and how to reach support.": "Estado público de Descall: etapa del producto (beta), comprobación del estado de la API, seguridad del transporte y cómo contactar con soporte.",
  "Descall service status": "Estado del servicio de Descall",
  "Network error": "Error de red",
  "Operational": "Operativo",
  "Product stage": "Etapa del producto",
  "Request timed out": "La solicitud agotó el tiempo de espera",
  "Security details": "Detalles de seguridad",
  "The API row is checked live from your browser each time you open this page.": "La fila de la API se comprueba en vivo desde tu navegador cada vez que abres esta página.",
  "Transport security": "Seguridad del transporte",
  "Unreachable from this browser": "No accesible desde este navegador"
};
