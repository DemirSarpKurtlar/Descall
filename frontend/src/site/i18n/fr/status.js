/**
 * Marketing site catalog for fr, part "status": English source string -> translation.
 * Strings only the page "status" uses; loaded with that page.
 * Written by `node scripts/site-i18n.mjs import | bake | prune | layout` (sorted keys,
 * placed by src/site/siteCatalogParts.js); edit through the tool so every string stays in
 * the part its page loads. Lookup order: the loaded parts, then the app phrases in
 * src/i18n/locales/fr.js (loaded only when a lookup misses), then English.
 */
export default {
  "API / realtime": "API / temps réel",
  "API reachable": "API joignable",
  "Degraded": "Dégradé",
  "Descall Status | Beta service & API health": "Statut Descall | Service en bêta et état de l'API",
  "Descall public status: Beta product stage, API health probe, transport security, and how to reach support.": "Statut public de Descall : stade bêta du produit, test de l'état de l'API, sécurité du transport et comment joindre le support.",
  "Descall service status": "État du service Descall",
  "Network error": "Erreur réseau",
  "Operational": "Opérationnel",
  "Product stage": "Stade du produit",
  "Request timed out": "Délai de la requête dépassé",
  "Security details": "Détails de sécurité",
  "The API row is checked live from your browser each time you open this page.": "La ligne API est vérifiée en direct depuis ton navigateur à chaque ouverture de cette page.",
  "Transport security": "Sécurité du transport",
  "Unreachable from this browser": "Inaccessible depuis ce navigateur"
};
