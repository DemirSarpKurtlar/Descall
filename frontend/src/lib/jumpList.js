/**
 * 4.2: what the page tells the Windows shell for the taskbar jump list
 * (electron/jumpList.cjs validates it again and builds the list). Recent DMs come from
 * lib/nativeIntents.js recentConversations; labels are in the UI language.
 */
export const JUMP_LIST_MAX_RECENT = 5;

export function jumpListPayload({ signedIn = false, recent = [], labels = {} } = {}) {
  return {
    signedIn: Boolean(signedIn),
    recent: (Array.isArray(recent) ? recent : [])
      .filter((r) => r && typeof r.username === "string" && r.username)
      .slice(0, JUMP_LIST_MAX_RECENT)
      .map((r) => ({ username: r.username, name: String(r.name || r.username).slice(0, 60) })),
    labels: Object.fromEntries(
      Object.entries(labels || {})
        .filter(([, v]) => typeof v === "string" && v)
        .map(([k, v]) => [k, v.slice(0, 80)])
    ),
  };
}
