/**
 * Yönetici Paneli sol menüsü (3.1): every section is listed with its icon,
 * grouped, never cut to "+N bölüm daha". AdminShell renders it on desktop,
 * iPad and in the phone drawer; Electron opens the whole panel in its own
 * window (/admin/panel). Pure helpers, tested by adminNav.selftest.mjs.
 */

/** Group key → section ids, in menu order. Unknown ids fall into "system". */
export const ADMIN_NAV_GROUPS = [
  ["general", ["overview", "maintenance", "agent", "analytics", "signupStats", "retention", "economy", "topUsers"]],
  ["people", ["directory", "people", "reports", "feedback", "moderation", "appeals", "dmReview", "serverReview", "suspicious", "accessBans"]],
  // Premium Yönetimi (Descall+ / Ultra, phase 1): nine pages, one grantable section "premium".
  ["premium", [
    "premiumDashboard", "premiumUsers", "premiumBulk", "premiumHistory", "premiumAnalytics",
    "premiumFinance", "premiumCampaigns", "premiumAudit", "premiumPlans",
  ]],
  ["content", ["shop", "shop2", "promo", "specialBadges", "announcements", "livepopup", "casino"]],
  // Admin Token (owner only) sits under Güvenlik, like the draft's breadcrumb.
  ["system", ["system", "security", "adminToken", "errors", "audit", "staff"]],
];

const GROUP_LABEL = {
  general: "admin.navGroupGeneral",
  people: "admin.navGroupPeople",
  premium: "premiumAdmin.navGroup",
  content: "admin.navGroupContent",
  system: "admin.navGroupSystem",
};

/**
 * Menu pages that share one permission section (the owner grants "premium" once,
 * every Premium Yönetimi page follows it; the server maps /admin/premium/* to it;
 * İtirazlar follows "moderation", like /admin/appeals on the server).
 */
export const TAB_SECTION = Object.freeze({
  // İtirazlar (ban experience): read and decided by whoever holds "moderation".
  appeals: "moderation",
  // Vitrin ve Setler (Market 2.0) follows the shop permission, like /admin/shop2 on the server.
  shop2: "shop",
  premiumDashboard: "premium",
  premiumUsers: "premium",
  premiumBulk: "premium",
  premiumHistory: "premium",
  premiumAnalytics: "premium",
  premiumFinance: "premium",
  premiumCampaigns: "premium",
  premiumAudit: "premium",
  premiumPlans: "premium",
});

/** Label of a section that is not a page of its own (Yöneticiler screen). */
export const SECTION_LABEL = Object.freeze({ premium: "premiumAdmin.navGroup" });

/**
 * Pages only the owner sees, whatever the server lists: Admin Token (bot tokens that act as
 * the owner account; the server checks userIsSuperAdmin on every /admin/tokens call).
 */
export const OWNER_ONLY_TABS = Object.freeze(["adminToken"]);

/** The sections a viewer may open: the server's list, plus the owner-only pages for the owner. */
export function withOwnerTabs(sections, owner) {
  const list = (Array.isArray(sections) ? sections : ["overview"]).filter((s) => !OWNER_ONLY_TABS.includes(s));
  return owner ? [...list, ...OWNER_ONLY_TABS] : list;
}

/** Permission section of a menu page (its own id unless listed in TAB_SECTION). */
export function sectionOfTab(id) {
  return TAB_SECTION[id] || id;
}

/** Permission sections in menu order (pages sharing a section listed once). */
export function menuSections() {
  return [...new Set(ADMIN_NAV_GROUPS.flatMap(([, ids]) => ids.map(sectionOfTab)))];
}

function fold(text) {
  return String(text || "")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
}

/**
 * @param {{id: string, label: string}[]} tabs the sections this viewer may open
 * @param {(key: string) => string} t
 * @param {string} [query]
 * @returns {{key: string, label: string, items: {id: string, label: string}[]}[]}
 */
export function groupAdminTabs(tabs, t, query = "") {
  const q = fold(query).trim();
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const placed = new Set();
  const groups = ADMIN_NAV_GROUPS.map(([key, ids]) => {
    const items = ids.filter((id) => byId.has(id)).map((id) => byId.get(id));
    items.forEach((x) => placed.add(x.id));
    return { key, items };
  });
  const rest = tabs.filter((tab) => !placed.has(tab.id));
  if (rest.length) groups[groups.length - 1].items.push(...rest);
  return groups
    .map((g) => ({
      key: g.key,
      label: t(GROUP_LABEL[g.key]),
      items: q ? g.items.filter((x) => fold(t(x.label)).includes(q) || fold(x.id).includes(q)) : g.items,
    }))
    .filter((g) => g.items.length);
}

export const ADMIN_PANEL_PATH = "/admin/panel";

/**
 * Electron desktop: open the admin panel in its own window (main.cjs allows and
 * focuses exactly one). Returns false when the caller should show the in-app panel
 * (web, iOS, Android, or a blocked window.open).
 */
export function openAdminPanelWindow() {
  if (typeof window === "undefined" || !window.electronAPI?.isElectron) return false;
  try {
    return Boolean(window.open(ADMIN_PANEL_PATH, "descall-admin"));
  } catch {
    return false;
  }
}
