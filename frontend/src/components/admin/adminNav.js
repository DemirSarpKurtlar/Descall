/**
 * Yönetici Paneli sol menüsü (3.1): every section is listed with its icon,
 * grouped, never cut to "+N bölüm daha". AdminShell renders it on desktop,
 * iPad and in the phone drawer; Electron opens the whole panel in its own
 * window (/admin/panel). Pure helpers, tested by adminNav.selftest.mjs.
 */

/** Group key → section ids, in menu order. Unknown ids fall into "system". */
export const ADMIN_NAV_GROUPS = [
  ["general", ["overview", "maintenance", "analytics", "signupStats"]],
  ["people", ["directory", "people", "reports", "feedback", "moderation", "suspicious", "accessBans"]],
  ["content", ["shop", "promo", "specialBadges", "announcements", "livepopup", "casino"]],
  ["system", ["system", "security", "errors", "audit", "staff"]],
];

const GROUP_LABEL = {
  general: "admin.navGroupGeneral",
  people: "admin.navGroupPeople",
  content: "admin.navGroupContent",
  system: "admin.navGroupSystem",
};

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
