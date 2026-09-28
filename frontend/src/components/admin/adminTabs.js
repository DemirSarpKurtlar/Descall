/** Voice archive stays last, and only the account named admin can see it. */
export function visibleAdminTabs(tabs, username) {
  const list = Array.isArray(tabs) ? tabs : [];
  const rest = list.filter((tab) => tab?.id !== "voice");
  if (username !== "admin") return rest;
  const voice = list.filter((tab) => tab?.id === "voice");
  return [...rest, ...voice];
}
