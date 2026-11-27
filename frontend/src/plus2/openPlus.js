/**
 * Open a Descall+ surface from anywhere (no React context needed): PlusHost listens.
 *   openPlus({ view: "hub" })                         the Descall+ center
 *   openPlus({ view: "server", serverId })            server level page / in-server paywall
 *   openPlus({ view: "checkout", tab: "self"|"gift", recipientId?, plan?, moment? })
 *   openPlus({ view: "manage" })                      membership, boosts, sent gifts, cancel
 *   openPlus({ view: "gift", giftId })                live gift tracker
 */
export const PLUS_OPEN_EVENT = "descall:plus-open";

export function openPlus(detail = {}) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(PLUS_OPEN_EVENT, { detail: { view: "hub", ...detail } }));
  } catch {
    /* old engines */
  }
}
