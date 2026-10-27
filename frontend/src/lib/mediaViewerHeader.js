/**
 * Header of the full-screen chat image viewer (MessageMediaLightbox):
 * who sent the picture and when.
 *
 * The viewer used to read the avatar only from `message.from`, which often has
 * no `avatarUrl` (live socket messages, my own optimistic sends, a sender that
 * was not in the backend profile cache). The message row itself merges that
 * sender with `me`, friends and online users before drawing <Avatar>, so the
 * row showed the photo and the viewer showed a letter. Both now go through the
 * same merge (`mergeUserProfiles`) and the same URL rule (`resolveAvatarUrl`).
 *
 * The time used the device locale (`toLocaleDateString(undefined)`), so an
 * iPhone set to English showed "10/20/2026 11:09 PM" inside a Turkish app.
 * It now follows the app language: "20.10.2026 23:09" in Turkish.
 */
import { mergeUserProfiles, resolveAvatarUrl } from "./userProfile.js";
import { intlLocaleTag, parseAppDate } from "./datetime.js";

/** Sender merged with every profile shard we know (same as the message row). */
export function enrichSender(user, { me, currentUser, friends, onlineUsers } = {}) {
  if (!user) return user;
  const id = user.id;
  const same = (x) => x && id != null && String(x.id) === String(id);
  const fromMe = same(me) ? me : same(currentUser) ? currentUser : null;
  const fromFriend = id != null && Array.isArray(friends) ? friends.find(same) : null;
  const fromOnline = id != null && Array.isArray(onlineUsers) ? onlineUsers.find(same) : null;
  return mergeUserProfiles(user, fromOnline, fromFriend, fromMe) || user;
}

/** Avatar URL for the viewer header, "" when the sender has none. */
export function senderAvatarUrl(user) {
  return resolveAvatarUrl(user) || "";
}

export function senderName(user, fallback = "") {
  if (!user) return fallback || "";
  return user.displayName || user.display_name || user.username || fallback || "";
}

/** "Bugün 23:09" / "20.10.2026 23:09" (tr), "Today 23:09" / "20/10/2026, 23:09" (en). */
export function formatViewerTime(at, locale, t, now = new Date()) {
  const d = parseAppDate(at);
  if (!d) return "";
  const tag = intlLocaleTag(locale);
  const hm = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  if (d.toDateString() === now.toDateString()) return `${t ? t("Today") : "Today"} ${hm}`;
  return new Intl.DateTimeFormat(tag, {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}
