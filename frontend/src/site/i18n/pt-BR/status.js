/**
 * Marketing site catalog for pt-BR, part "status": English source string -> translation.
 * Strings only the page "status" uses; loaded with that page.
 * Written by `node scripts/site-i18n.mjs import | bake | prune | layout` (sorted keys,
 * placed by src/site/siteCatalogParts.js); edit through the tool so every string stays in
 * the part its page loads. Lookup order: the loaded parts, then the app phrases in
 * src/i18n/locales/pt-BR.js (loaded only when a lookup misses), then English.
 */
export default {
  "API / realtime": "API / tempo real",
  "API reachable": "API acessível",
  "Degraded": "Instável",
  "Descall Status | Beta service & API health": "Status do Descall | Serviço beta e saúde da API",
  "Descall public status: Beta product stage, API health probe, transport security, and how to reach support.": "Status público do Descall: fase beta do produto, verificação de saúde da API, segurança do transporte e como falar com o suporte.",
  "Descall service status": "Status do serviço Descall",
  "Network error": "Erro de rede",
  "Operational": "Operacional",
  "Product stage": "Fase do produto",
  "Request timed out": "A solicitação expirou",
  "Security details": "Detalhes de segurança",
  "The API row is checked live from your browser each time you open this page.": "A linha da API é verificada ao vivo pelo seu navegador sempre que você abre esta página.",
  "Transport security": "Segurança do transporte",
  "Unreachable from this browser": "Inacessível a partir deste navegador"
};
