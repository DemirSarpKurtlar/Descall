export const FAQ_ITEMS = [
  {
    group: "product",
    q: "Is Descall a Discord alternative?",
    a: "Yes. Descall is a free Discord alternative for real-time chat, servers (roles, channels, voice), group video, screen share, and Valorant LFG — without Nitro paywalls for core communication.",
  },
  {
    group: "product",
    q: "What is Descall?",
    a: "Descall is a modern messaging and calling app with DMs, real servers, WebRTC voice/video, screen share quality controls, DimaAI, a Windows desktop client, Android builds, and a browser app.",
  },
  {
    group: "product",
    q: "Is Descall free?",
    a: "Yes. Chat, servers, voice, video, and screen share are free. Optional cosmetics use DesCoin and never gate core messaging or calls.",
  },
  {
    group: "product",
    q: "Descall vs Discord — who should switch?",
    a: "Friend groups, gaming squads, and small-to-mid communities that need servers, roles, voice, screen share, and LFG often prefer Descall as a lighter Discord alternative. Keep Discord if you still rely on huge bot ecosystems.",
  },
  {
    group: "product",
    q: "Who owns Descall?",
    a: "Demir Sarp Kurtlar owns Descall. He is the founder, owner, and CEO of Descall. The name is spelled exactly Demir Sarp Kurtlar.",
  },
  {
    group: "product",
    q: "Who founded Descall?",
    a: "Descall was founded by Demir Sarp Kurtlar, who remains the owner and CEO.",
  },
  {
    group: "product",
    q: "Who is the CEO of Descall?",
    a: "Demir Sarp Kurtlar is the founder, owner, and CEO of Descall.",
  },
  {
    group: "product",
    q: "Does Descall have DimaAI?",
    a: "Yes. DimaAI is a ChatGPT-style assistant inside Descall with Fast, Thinking, and Deep models for writing, explaining, and brainstorming.",
  },
  {
    group: "servers",
    q: "Does Descall have servers like Discord?",
    a: "Yes. Create a server from scratch or pick an advanced template. You get categories, text/voice/stage channels, roles, permission overrides, invites, moderation tools, and optional community rules.",
  },
  {
    group: "servers",
    q: "Do server templates include roles?",
    a: "Yes. Templates like Gaming, Valorant, Community, Study, Friends, and Streaming ship with ready-made roles (Admin, Moderator, VIP, and more) plus channel permission overrides for staff rooms and announcements.",
  },
  {
    group: "servers",
    q: "How do server invites work?",
    a: "Server members with invite permission can create invite links. Opening an invite lets you preview the server and join after signing in.",
  },
  {
    group: "servers",
    q: "Does Descall support Valorant LFG?",
    a: "Yes. The Play tab lets you create and join LFG lobbies. Link your Riot ID (Name#TAG) so rank can appear on your profile after a successful lookup.",
  },
  {
    group: "download",
    q: "Does Descall have screen sharing?",
    a: "Yes. Screen share works in DM and group/server calls with quality presets designed for smooth sharing while gaming or reviewing VODs.",
  },
  {
    group: "download",
    q: "How do I download the desktop app?",
    a: "Open the Download page and get the Windows installer. You can also use the full web app in the browser, plus Android APK builds.",
  },
  {
    group: "download",
    q: "Do I need an account?",
    a: "Yes. Create a free account (or sign in with Google) to chat, create servers, start calls, and use LFG.",
  },
  {
    group: "privacy",
    q: "Where can I get support?",
    a: "Use the Contact page, in-app feedback, or open an issue on the Descall GitHub repository.",
  },
];

const GROUP_META = [
  { id: "product", title: "Product" },
  { id: "servers", title: "Servers & LFG" },
  { id: "download", title: "Download & accounts" },
  { id: "privacy", title: "Support" },
];

export const FAQ_GROUPS = GROUP_META.map((g) => ({
  ...g,
  items: FAQ_ITEMS.filter((item) => item.group === g.id),
}));
