// Shop category tabs: the single source for every platform (web, Windows/Electron, iOS and
// Android bundle the same web build). Avatar frames were removed in 2.10.114 and must never
// come back as a tab, even if an old catalog row or cached response still carries one.
//
// iOS / Android ship the web build inside the app, so an installed build keeps the tab list it
// was compiled with. Since 2.11.2 the server also sends `retiredCategories` with the catalog
// and the client hides those tabs, so a future removal reaches already-installed builds.

export const REMOVED_SHOP_CATEGORIES = Object.freeze(["avatar_frame", "sound_pack"]);

export const SHOP_CATEGORY_TABS = Object.freeze([
  { id: "banner", label: "Banners" },
  { id: "avatar_effect", label: "Avatar Effects" },
  { id: "profile_background", label: "Backgrounds" },
  { id: "theme", label: "Themes" },
  { id: "profile_badge", label: "Badges" },
  { id: "profile_title", label: "Titles" },
  { id: "name_effect", label: "Name Effects" },
  { id: "chat_bubble", label: "Bubbles" },
  { id: "presence_flare", label: "Presence" },
  { id: "profile_aura", label: "Auras" },
  { id: "typing_flare", label: "Typing" },
  { id: "reaction_burst", label: "Reactions" },
  { id: "call_overlay", label: "Call Overlays" },
]);

/** True for a category the shop must never show (built-in removals + server-announced). */
export function isRetiredShopCategory(category, serverRetired = []) {
  return REMOVED_SHOP_CATEGORIES.includes(category) || (Array.isArray(serverRetired) && serverRetired.includes(category));
}

/**
 * Tabs to render. `showEmpty` keeps tabs without items (phone glass shell shows every tab
 * so the row does not jump while loading); retired categories are always dropped.
 */
export function visibleShopTabs(tabs, { counts = new Map(), showEmpty = false, serverRetired = [] } = {}) {
  return tabs.filter((tab) => !isRetiredShopCategory(tab.id, serverRetired) && (showEmpty || counts.has(tab.id)));
}

/** Catalog items with retired categories removed (defence in depth against stale rows). */
export function visibleShopItems(items, serverRetired = []) {
  return (Array.isArray(items) ? items : []).filter((item) => !isRetiredShopCategory(item?.category, serverRetired));
}
