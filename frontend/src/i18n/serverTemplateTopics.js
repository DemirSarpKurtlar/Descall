/**
 * Channel topics written by the server templates (backend/lib/serverTemplates.js).
 * New servers get them in the creator's language, but servers made before that (and
 * servers made by English speakers) store the English sentence, so a Turkish member
 * saw "Server rules — accept before ..." in a Turkish UI.
 *
 * channelTopicText() shows a template topic in the viewer's language. Only these
 * exact sentences are translated; a topic a member typed is always shown as stored.
 * The backend tags a stored template topic in any language with
 * i18n.topic.key = <English sentence> (publicChannel in backend/routes/servers.js),
 * so a template topic stored in Turkish also reads in English for an English member.
 *
 * Translations: src/i18n/locales/serverTemplateTopics.i18n.js (the same text as
 * backend/i18n/<locale>.js templates.*; serverTemplateTopics.selftest.mjs checks both).
 */
import { t as runtimeT } from "./runtime.js";

export const SERVER_TEMPLATE_TOPICS = Object.freeze([
  "Official server news and patch notes. Read-only for members.",
  "Server rules — accept before chatting in community channels.",
  "Say hi — game, rank, region, and what you play.",
  "Main hangout for anything gaming.",
  "Squad-up posts: game · rank · region · mic yes/no.",
  "Drop your best clips and screenshots.",
  "Keep it light. No harassment.",
  "Watch parties and tournament briefs.",
  "Private staff coordination.",
  "Moderation notes and case log.",
  "Daily chat — memes welcome.",
  "Hangouts, watch parties, trips.",
  "Share pics from hangs and trips.",
  "Playlists, TikToks, and random links.",
  "Admin / co-host planning.",
  "Official updates. Members cannot post here.",
  "Community guidelines.",
  "New members introduce themselves here.",
  "Ask for interest roles / contributor tags.",
  "Main conversation.",
  "Need help? Staff will respond here.",
  "Upcoming events and RSVPs.",
  "Self-promo allowed here only — one post per day.",
  "Share your work, streams, and wins.",
  "AMAs, announcements, and live events.",
  "Internal staff discussion.",
  "Reports and open moderation cases.",
  "Deadlines, sessions, and campus news.",
  "Study community guidelines.",
  "Major, year, and what you're studying.",
  "Off-topic campus chat.",
  "Ask questions — show your work.",
  "Notes, links, and study guides.",
  "Daily goals and check-ins.",
  "Mentor-led Q&A sessions.",
  "Mentors + mods coordinate help sessions.",
  "Schedule and big drops.",
  "Live notifications only.",
  "Chat rules for streams and VODs.",
  "Hang with the community.",
  "Active during streams — keep spoilers out.",
  "Best moments from streams.",
  "Collab requests and shoutouts.",
  "Content ideas for the creator.",
  "Perks chat for VIP / Subscriber.",
  "Post-stream hangouts and AMAs.",
  "Moderation during live.",
]);

const TOPIC_SET = new Set(SERVER_TEMPLATE_TOPICS);

/** The English template sentence behind a channel's topic, or null for a member's own text. */
export function templateTopicKey(channel) {
  const raw = typeof channel?.topic === "string" ? channel.topic.trim() : "";
  if (!raw) return null;
  // The server's key counts only for the text it was read from: after a topic edit
  // is merged into the cached channel, a stale key must not hide the new text.
  const ref = channel?.i18n?.topic;
  if (ref && typeof ref.key === "string" && TOPIC_SET.has(ref.key)
    && typeof ref.source === "string" && ref.source.trim() === raw) return ref.key;
  return TOPIC_SET.has(raw) ? raw : null;
}

/** The channel topic to display: a template topic in the viewer's language, else as stored. */
export function channelTopicText(channel, t = runtimeT) {
  const raw = typeof channel?.topic === "string" ? channel.topic.trim() : "";
  if (!raw) return "";
  const key = templateTopicKey(channel);
  return key ? t(key) : raw;
}
