/**
 * Picks the next Reel: never a posted script, never a duplicate of the last posts,
 * and the theme that has waited longest (themes never posted first).
 */
import { checkAgainstLog } from "./validator.mjs";
import { istanbulDate, postedOn } from "./library.mjs";

/**
 * @param {object}   o
 * @param {object[]} o.scripts        valid scripts, in library order
 * @param {object[]} o.posts          posted log entries, oldest first
 * @param {object}   o.policy
 * @param {string}   [o.forcedId]     workflow_dispatch script_id
 * @param {Date}     [o.now]
 * @param {boolean}  [o.allowSameDay] dry runs may pick on a day that already has a post
 * @param {string[]} [o.recentCaptions] captions of the IG account's latest posts
 * @returns {{ script: object|null, reason: string }}
 */
export function pickNext({ scripts, posts, policy, forcedId, now = new Date(), allowSameDay = false, recentCaptions = [] }) {
  const today = istanbulDate(now);
  if (!allowSameDay && postedOn(posts, today)) return { script: null, reason: `already posted today (${today})` };

  if (forcedId) {
    const s = scripts.find((x) => x.id === forcedId);
    if (!s) return { script: null, reason: `script ${forcedId} is not in the valid library` };
    const dup = checkAgainstLog(s, posts, policy, recentCaptions);
    if (dup.length) return { script: null, reason: dup.join("; ") };
    return { script: s, reason: "forced by script_id" };
  }

  const candidates = scripts.filter((s) => checkAgainstLog(s, posts, policy, recentCaptions).length === 0);
  if (!candidates.length) return { script: null, reason: "library exhausted: every script was posted, add new scripts" };

  // Distance since a theme was last posted (Infinity when never), and how often it ran.
  const lastIndex = new Map();
  const count = new Map();
  posts.forEach((p, i) => {
    lastIndex.set(p.theme, i);
    count.set(p.theme, (count.get(p.theme) || 0) + 1);
  });
  const distance = (theme) => (lastIndex.has(theme) ? posts.length - lastIndex.get(theme) : Infinity);

  const order = new Map(scripts.map((s, i) => [s.id, i]));
  const firstOfTheme = new Map();
  for (const s of candidates) if (!firstOfTheme.has(s.theme)) firstOfTheme.set(s.theme, s);
  const themes = [...firstOfTheme.keys()].sort((a, b) => {
    const da = distance(a);
    const db = distance(b);
    if (da !== db) return db > da ? 1 : -1;
    const c = (count.get(a) || 0) - (count.get(b) || 0);
    if (c !== 0) return c;
    return order.get(firstOfTheme.get(a).id) - order.get(firstOfTheme.get(b).id);
  });
  const theme = themes[0];
  return { script: firstOfTheme.get(theme), reason: `theme ${theme} waited longest` };
}
