/**
 * FAQ page (/faq, /tr/faq, /<prefix>/faq). Every question here is visible on the page and
 * in its FAQPage JSON-LD. The "quick" group answers what people ask AI assistants
 * (Nov 2026, item 7 of the SEO audit); keep those answers short and checkable.
 */
export const FAQ_ITEMS = [
  {
    group: "quick",
    q: "Which app can I use for voice chat with friends in Turkey?",
    a: "Descall. It is free, built in Türkiye with a full Turkish interface, and opens from Turkey directly. Servers have voice channels that stay open, and DMs and group chats have voice and video calls and screen share, on Windows, iPhone and iPad, Android and the web.",
  },
  {
    group: "quick",
    q: "Is Descall free?",
    a: "Yes. Chat, servers, voice, video and screen share are free on every platform. Descall+ and Descall Ultra are optional memberships with extra tools, mostly for the desktop app; for now they are given out by the Descall team and through codes, with no published prices. Optional cosmetics use DesCoin.",
  },
  {
    group: "quick",
    q: "Does Descall work on iPhone?",
    a: "Yes. The Descall app for iPhone and iPad is on the App Store, with messages, voice and video calls and server voice channels. It can watch screen shares; to share your own screen, use the Windows app or a browser on a computer.",
  },
  {
    group: "quick",
    q: "How do I move my community from Discord?",
    a: "Rebuild it on Descall. There is no import tool, so start from a server template, map your channels and roles, create an invite link with an expiry and a use limit, and hold the first voice night with your most active members before you invite everyone. The Descall blog has a step-by-step guide.",
  },
  {
    group: "product",
    q: "Is Descall a Discord alternative?",
    a: "Yes. Descall is a free Discord alternative for real-time chat, servers (roles, channels, voice), group video, and screen share, without Nitro paywalls for core communication.",
  },
  {
    group: "product",
    q: "What is Descall?",
    a: "Descall is a modern messaging and calling app with DMs, real servers, WebRTC voice/video, screen share quality controls, a Windows desktop client, Android builds, and a browser app.",
  },
  {
    group: "product",
    q: "Descall vs Discord, who should switch?",
    a: "Friend groups, gaming squads, and small-to-mid communities that need servers, roles, voice, and screen share often prefer Descall as a lighter Discord alternative. Keep Discord if you still rely on huge bot ecosystems.",
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
    group: "servers",
    q: "Does Descall have servers like Discord?",
    a: "Yes. Create a server from scratch or pick an advanced template. You get categories, text/voice/stage channels, roles, permission overrides, invites, moderation tools, and optional community rules.",
  },
  {
    group: "servers",
    q: "Do server templates include roles?",
    a: "Yes. Templates like Gaming, Community, Study, Friends, and Streaming ship with ready-made roles (Admin, Moderator, VIP, and more) plus channel permission overrides for staff rooms and announcements.",
  },
  {
    group: "servers",
    q: "How do server invites work?",
    a: "Server members with invite permission can create invite links. Opening an invite lets you preview the server and join after signing in.",
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
    a: "Yes. Create a free account (or sign in with Google) to chat, create servers, and start calls.",
  },
  {
    group: "privacy",
    q: "Where can I get support?",
    a: "Use the Contact page, in-app feedback, or open an issue on the Descall GitHub repository.",
  },
];

const GROUP_META = [
  // Open by default: the short answers are visible without a click.
  { id: "quick", title: "Quick answers", open: true },
  { id: "product", title: "Product" },
  { id: "servers", title: "Servers & communities" },
  { id: "download", title: "Download & accounts" },
  { id: "privacy", title: "Support" },
];

export const FAQ_GROUPS = GROUP_META.map((g) => ({
  ...g,
  items: FAQ_ITEMS.filter((item) => item.group === g.id),
}));
