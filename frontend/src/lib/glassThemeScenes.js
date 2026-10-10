/** Scene themes sold in the shop. Keys match the backend catalog. */
export const GLASS_THEME_SCENES = [
  { sku: "theme-lagoon", key: "lagoon", motion: "static" },
  { sku: "theme-grove", key: "grove", motion: "static" },
  { sku: "theme-hanami", key: "hanami", motion: "static" },
  { sku: "theme-emberfall", key: "emberfall", motion: "animated" },
  { sku: "theme-borealis", key: "borealis", motion: "animated" },
  { sku: "theme-starwell", key: "starwell", motion: "animated" },
  { sku: "theme-chromeveil", key: "chromeveil", motion: "premium" },
  { sku: "theme-iriscape", key: "iriscape", motion: "premium" },
];

export const GLASS_THEME_SCENE_SKUS = new Set(GLASS_THEME_SCENES.map((item) => item.sku));
