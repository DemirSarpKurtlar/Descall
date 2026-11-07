/**
 * The three product rows of /features (FeaturesPage.jsx). Plain data so the prerendered
 * twin (seo/pageTwins.js) renders the same text, shots and order as the React page.
 * `mode` is the SeoProductPreview shot; `flip` puts the shot on the right.
 */
export const FEATURE_GROUPS = [
  {
    mode: "servers",
    title: "Servers with roles and channels",
    caption: "Server list with text and voice channels",
    items: [
      "Full server structure with categories, text, voice, and stage channels, topics, slowmode, and NSFW flags included.",
      "Role hierarchy with hoist/mention, plus per-channel allow/deny overrides for staff rooms, announcements, and VIP spaces.",
      "Gaming, Community, Study, Friends, and Streaming templates with roles and staff rooms preconfigured.",
      "Kick, ban, timeout, audit logs, and community rules for servers that need staff workflows.",
    ],
  },
  {
    mode: "call",
    title: "Voice, video, and screen share",
    caption: "A server voice channel with the people already in the call",
    flip: true,
    items: [
      "WebRTC voice for DMs, groups, and server lobbies with noise controls when you need them.",
      "Group video for hangouts, watch parties, and squad briefings, browser or desktop.",
      "Share games, VODs, or docs with quality presets tuned for smooth capture while you play.",
      "DMs and server chat with typing indicators, reactions, replies, and media, without Nitro walls on core chat.",
    ],
  },
  {
    mode: "friends",
    title: "Friends and presence",
    caption: "Friends list, ready for a lobby or a call",
    items: [
      "Friend presence, activity status, and quick voice with your squad.",
      "Friend requests, online presence, and quick invites so your squad can jump into chat or voice.",
      "Windows installer plus Android builds, or use the full web app in the browser.",
      "DesCoin cosmetics stay optional. Chat, servers, voice, and screen share remain free.",
    ],
  },
];

/** Same files and sizes as SeoProductPreview SHOTS. */
export const PREVIEW_SHOT_FILES = {
  chat: "/brand/previews/02-dm.webp",
  servers: "/brand/previews/06-server.webp",
  call: "/brand/previews/09-server-voice.webp",
  friends: "/brand/previews/11-friends.webp",
};
