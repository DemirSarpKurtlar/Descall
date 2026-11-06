/**
 * Long-form blog bodies keyed by slug. Keep unique; no keyword-spam clones.
 * Five posts were merged into stronger pages in Nov 2026 (seo/mergedPages.js); their
 * sections moved to seo/mergedGuides.js and are shown on the kept pages.
 */

export const BLOG_BODIES = {
  "leave-nitro-keep-voice-chat": {
    sections: [
      {
        h: "Why groups end up paying for Nitro",
        p: "Most friend groups do not sit down and decide to subscribe. One person buys Nitro for a perk, another follows to match, and a year later several people are paying every month for a voice chat they could have for free. Nitro is a reasonable product if you use its extras. The question worth asking is whether your group uses them, or whether you mainly want to talk, share a screen and keep a running chat.",
      },
      {
        h: "Audit what your group actually uses",
        p: "Open your server and look at the last month honestly. Which channels had messages, who joined voice, how often did someone share a screen, and which paid perks did anyone notice? Most groups find the answer is short: a group chat, one or two voice rooms, the occasional stream and a lot of memes. Ask the people who pay, too, because they often cannot name a perk they used last week. That short list is your real requirement, and it is the only thing a replacement needs to match.",
      },
      {
        h: "What stays free on Descall",
        p: "Descall keeps the parts you use every night free. Direct messages, group chats, servers with roles and channels, one-on-one and group voice and video calls, server voice channels and screen share all cost nothing. Search over your whole message history, replies, reactions, polls, pinned messages and voice notes are included too. There is no paid tier that improves call quality or unlocks screen share. Group screen share starts at around 720p and about 20 frames per second, with presets if someone needs a lighter or sharper stream, and the same rules apply to everyone in the call.",
      },
      {
        h: "Where cosmetics fit",
        p: "If part of the fun of Nitro was a nicer profile, Descall has an optional shop for that. You can pick profile banners, card colors, name effects, avatar effects and country flags. They are paid with DesCoin, which you earn by using the app, not with a monthly subscription. Nothing in the shop changes how calls sound or what you can do in a server, so friends who never touch it miss nothing.",
      },
      {
        h: "Week one: move the evening call",
        p: "Do not try to move everything at once. Pick the one habit that matters most, usually the evening voice call, and run it on Descall for a week. Create accounts, add each other as friends and start a group call when people come online. Use screen share the way you normally would. Keep Discord open in the background so nobody feels cut off while the new habit forms.",
      },
      {
        h: "Week two: move the server",
        p: "Once the call feels normal, recreate your server. Start from a template, rename the channels to match what you had, set up two or three roles and send the invite code in your old group chat. Move pinned links and important notes by hand, since there is no tool that imports Discord history. By the end of the second week most groups notice that nobody has opened Discord for the call in days.",
      },
      {
        h: "What you give up, honestly",
        p: "Descall is smaller and newer than Discord. There is no bot marketplace, so a group that relies on a music bot or a custom moderation bot will miss it. There is no huge public server directory either, and your old message history stays on Discord. If those things are central to your group, keep a free Discord account for them and move only the private calls. Dropping the subscription does not require deleting anything.",
      },
      {
        h: "Getting the holdouts on board",
        p: "Every group has one person who will not install another app. Send them the web link, descall.com/app, so they can join the call from a browser in a minute. Friends on iPhone, iPad or Android can install the mobile app later, and the Windows app is there for long sessions. If someone in your group lives in Turkey, where Discord has been blocked by court order since 9 October 2024, Descall also removes the workarounds they may have needed.",
      },
      {
        h: "Cancel on your own schedule",
        p: "There is no need to cancel Nitro on day one. Let the current period run out while you test the move. When the renewal date comes, check whether anyone still opened Discord for the call that month. If not, cancel and keep the free account for the public servers you follow. Your voice nights stay the same, and nobody in the group is paying for them anymore.",
      },
    ],
  },
  "best-discord-alternatives-2026": {
    sections: [
      {
        h: "How we judged this shortlist",
        p: "We make Descall, so read this list with that in mind. To keep it useful, we judged every app on the same five questions. Are chat and calls free at the core? Does group voice hold up on ordinary home and mobile networks? Can you organize people into spaces with roles? Does it run on the devices your friends actually use? And can a real group switch to it within a week? Feature count was not a criterion, because a long list rarely predicts whether people will keep using an app.",
      },
      {
        h: "Descall: free voice, video and servers for friend groups",
        p: "Descall is the closest match if you want what most groups use Discord for, without a subscription. You get DMs, group chats, servers with roles and permissions, text, voice and stage channels, group voice and video calls and screen share with quality presets. It runs on Windows, iPhone and iPad, Android and the web, in Turkish and English, and it works in Turkey. Its limits are real: it is smaller and newer, has no bot marketplace and no big public server discovery. It fits friend groups, gaming squads and small to medium communities best.",
      },
      {
        h: "TeamSpeak: voice first, with your own server",
        p: "TeamSpeak has been a voice tool for a long time, and its core idea is still the same: a server you or a host run, with channels people drop into. Groups that care about controlling where their voice server lives like that model. The trade-off is that text chat, mobile use and social features are secondary to voice, and someone has to manage the server. It suits groups who mainly want an always-on voice room.",
      },
      {
        h: "Mumble: open source and lightweight",
        p: "Mumble is an open source voice chat app that you can self-host. It is light on resources and is known for low-latency voice, which is why it has stayed popular with technical groups. It does not try to be a social app, so you will not get the profiles, rich chat and media of Discord. If you have someone comfortable running a server and you only need voice, Mumble is a solid, free choice.",
      },
      {
        h: "Guilded and Revolt: community-style alternatives",
        p: "Guilded built its pitch around organized gaming communities, with tools for teams, events and structured servers. Revolt is an open source project with a layout that will feel familiar to Discord users. Both are worth a look if you want something close to the Discord model from a different provider. As with any smaller platform, Descall included, check the current state of the apps your friends would need before you move a whole community.",
      },
      {
        h: "Element and Matrix: decentralized and self-hostable",
        p: "Element is the best-known app for Matrix, an open, decentralized messaging protocol. You can use a public server or host your own, and rooms on different servers can talk to each other. Groups that care about running their own infrastructure often land here. The experience is more complex than a single hosted app, and voice and video work differently from Discord-style drop-in rooms, so test calls with your group first.",
      },
      {
        h: "Slack, Telegram, WhatsApp and Signal: great at other jobs",
        p: "These apps show up in many lists of Discord alternatives, but each one was built for a different job. Slack is designed for workplaces and organized around company workspaces. Telegram is strong at large broadcast channels and groups. WhatsApp is where many families and friends already text. Signal focuses on private messaging. All of them can carry a group chat, and some handle group calls, but none recreates the feel of servers with drop-in voice channels.",
      },
      {
        h: "Discord: when staying is the right answer",
        p: "Discord is still the default for large public communities. If your server runs on bots, depends on public discovery or has thousands of active members, moving is a big project with real costs. Many people keep Discord for those spaces and move only their private friend calls. That split is a fine outcome, and it is often the easiest way to try an alternative without pressure.",
      },
      {
        h: "Which one should you try first?",
        p: "If you want free chat, voice and servers for friends or a squad, start with Descall. If you only need an always-on voice room and have someone to run it, try TeamSpeak or Mumble. If self-hosting and an open protocol matter most, look at Element. If your community lives on bots and public discovery, stay on Discord and move only what makes sense. Whatever you pick, test it with your real group for a week before you call the move done.",
      },
    ],
  },
  "discord-competitors": {
    sections: [
      {
        h: "What it takes to compete with Discord",
        p: "Discord is hard to compete with head-on. It has a huge network of existing servers, a large bot ecosystem, public discovery, and years of work on its clients. A new app cannot match all of that at once. So the real Discord competitors in 2026 each pick a part of what Discord does and try to do that part better, cheaper or in a different way. Seeing the market as a set of segments makes it much easier to judge who actually competes for your group.",
      },
      {
        h: "Segment one: lighter apps for friends and squads",
        p: "These apps go after the private side of Discord: friend groups, gaming squads and small servers that mainly want chat and voice. They compete on simplicity, free core features and a calmer interface. Their bet is that most people never used the parts of Discord that make it heavy, and would trade them for an app that opens fast and asks for nothing. Descall sits here. It offers DMs, group chats, servers with roles, group voice and video calls and screen share without a subscription, and it adds full servers on top for groups that need structure.",
      },
      {
        h: "Segment two: community platforms",
        p: "Apps like Guilded and Revolt compete on the community side, offering servers and channels in a model that will feel familiar to Discord users. Guilded has focused on organized gaming communities, while Revolt is an open source project. They are the most direct like-for-like Discord competitors, so the useful questions are about maturity, mobile support and whether the people you want to bring along will join. A familiar layout lowers the cost of switching, but it does not move a community on its own.",
      },
      {
        h: "Segment three: voice-first classics",
        p: "TeamSpeak and Mumble were around long before Discord and still compete on one thing: voice. Both can run on a server you control, and Mumble is open source. They tend to win with groups that care about hosting their own voice server and do not need much text chat or social features. They compete with Discord for voice time, not for whole communities. For a group that already texts somewhere else and only needs a place to talk, that narrow focus can be exactly right.",
      },
      {
        h: "Segment four: open and decentralized networks",
        p: "Element, built on the open Matrix protocol, competes on ownership. You can host your own server, connect with rooms on other servers, and avoid depending on a single company. That appeals to technical communities and organizations. The trade-off is a more complex setup and a different feel from Discord's drop-in voice rooms. For a casual friend group the extra control is rarely worth the effort, but for a project that wants to own its data and history it can be the deciding factor.",
      },
      {
        h: "Overlap, not competition: messengers and work chat",
        p: "Slack, Telegram, WhatsApp and Signal are often named as Discord competitors, but they only overlap on some jobs. Slack is built for workplaces. Telegram is strong at broadcast channels and large groups. WhatsApp and Signal are personal messengers. Your group can use any of them for texting, yet none offers the server-plus-voice-channel structure that defines Discord, so they rarely replace it completely.",
      },
      {
        h: "Where Descall competes",
        p: "Descall competes directly with Discord for friend groups and small to medium communities. Its main arguments are free voice, video and screen share, servers with roles and permissions, server templates, search across the whole message history, and an interface in Turkish and English. It also works in Turkey, where Discord has been blocked by court order since 9 October 2024, which matters for any group with members there. Account security is covered with two-step verification and a data export, so you are not locked in.",
      },
      {
        h: "Where Descall does not compete",
        p: "Descall does not try to match Discord's bot marketplace or its public server discovery, and it is not built for servers with very large audiences. Its desktop app is for Windows; on other computers you use the web app. If your community depends on those things, Discord is still the better tool, and saying so plainly is more useful than pretending otherwise.",
      },
      {
        h: "How to judge any Discord competitor",
        p: "Start with your must-haves, such as voice quality, servers, mobile apps or self-hosting. Check whether those features are free. Look for signs that the app is actively maintained and that you can protect accounts with two-step verification and export your data. Then run a real test: use it with your actual group for seven nights. The competitor worth keeping is the one people open without being reminded.",
      },
    ],
  },
};
