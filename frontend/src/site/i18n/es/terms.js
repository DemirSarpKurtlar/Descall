/**
 * Marketing site catalog for es, part "terms": English source string -> translation.
 * Strings only the page "terms" uses; loaded with that page.
 * Written by `node scripts/site-i18n.mjs import | bake | prune | layout` (sorted keys,
 * placed by src/site/siteCatalogParts.js); edit through the tool so every string stays in
 * the part its page loads. Lookup order: the loaded parts, then the app phrases in
 * src/i18n/locales/es.js (loaded only when a lookup misses), then English.
 */
export default {
  "Descall Terms of Service | Age, Acceptable Use & Accounts": "Términos de Descall | Edad, uso aceptable y cuentas",
  "Terms of Service for Descall web and desktop apps: age requirements (13+), acceptable use, account suspension, DesCoin cosmetics, and liability limits.": "Términos de Descall (web y escritorio): edad mínima (13+), uso aceptable, suspensión de cuentas, cosméticos con DesCoin y límites de responsabilidad."
};
