/**
 * Turkish marketing phrases (marketingPhrases.tr.js, which pulls in the 66 KB trGaps
 * table) load only for Turkish visitors. They used to be a static import of the
 * marketing provider, so every language downloaded them before the page could render.
 *
 * hydrateMarketing.jsx awaits loadMarketingTr() before the first render when the boot
 * locale is Turkish (no English flash); a later switch to Turkish loads it on demand.
 */
let phrases = null;
let pending = null;

/** The Turkish phrase table, or null while it is not loaded. */
export function getMarketingTr() {
  return phrases;
}

/** Load the Turkish phrase table once; resolves with it. */
export function loadMarketingTr() {
  if (phrases) return Promise.resolve(phrases);
  if (!pending) {
    pending = import("./marketingPhrases.tr.js").then((m) => {
      phrases = m.MARKETING_TR || {};
      return phrases;
    });
  }
  return pending;
}
